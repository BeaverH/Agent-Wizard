import {migrateSkillState,skillBindingError,skillExecutionGate,snapshotSkills} from './skill-model';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { initialState, now, uid, type DemoState, type Agent, type Run, type Workspace } from './model';

import {enforceRunGovernance,ensureGovernance, transitionGovernance, governanceGate, assessCandidate, candidateAssessment, deployGovernance, type GovernanceAction} from './governance';

const KEY='agent-wizard-demo-v1';
export interface PageProps { page:string; selectedId?:string; onNavigate:(workspace:Workspace,page:string,id?:string)=>void }
function read():DemoState {
 try {
  const s=JSON.parse(localStorage.getItem(KEY)||'null') as DemoState|null;
  if(s&&['agents','resources','approvals','runs','feedback','audit'].every(k=>Array.isArray(s[k as keyof DemoState]))){
   // Migrate the original demo fixtures without replacing browser edits.
   s.agents=[...s.agents,...initialState.agents.filter(a=>['AGT-007','AGT-008'].includes(a.id)&&!s.agents.some(x=>x.id===a.id))];
   s.agents=s.agents.map(a=>({...a,enabled:a.deployment==='stopped'?false:a.enabled,versions:a.versions.map(v=>{
    const seed=initialState.agents.find(x=>x.id===a.id)?.versions.find(x=>x.version===v.version&&x.revision===v.revision);
    return {...v,releaseId:v.releaseId==='REL-002'&&seed?seed.releaseId:v.releaseId,evidence:v.evidence??(seed?structuredClone(seed.evidence):undefined)};
   })}));
   s.runs=s.runs.map(r=>({...r,releaseId:r.releaseId==='REL-002'?(s.agents.find(a=>a.id===r.agentId)?.versions.find(v=>v.version===r.version)?.releaseId||r.releaseId):r.releaseId}));
   s.approvals=s.approvals.map(ap=>{
    if(ap.type!=='release'||ap.evidence)return ap;
    const seed=initialState.approvals.find(x=>x.id===ap.id&&x.revision===ap.revision&&x.version===ap.version);
    const a=s.agents.find(x=>x.id===ap.agentId);
    const evidence=seed?.evidence??(ap.status==='pending'&&a?.testedRevision===ap.revision&&a.testResult?{revision:ap.revision,input:a.testInput,result:a.testResult,method:'旧版演示记录迁移 · 匹配修订的单次验证'}:undefined);
    return {...ap,evidence:evidence?structuredClone(evidence):undefined};
   });
   s.governance=ensureGovernance(s);
   // Existing approval evidence predates the new demo gate; preserve the published review flow.
   for(const a of s.agents.filter(a=>['pending','approved'].includes(a.status))){if(!candidateAssessment(s,a))s.governance=assessCandidate(s,a).governance;}
   return migrateSkillState(s);
  }
 }catch{}
 const fresh=structuredClone(initialState);fresh.governance=ensureGovernance(fresh);
 for(const a of fresh.agents.filter(a=>['pending','approved'].includes(a.status)))fresh.governance=assessCandidate(fresh,a).governance;
 return migrateSkillState(fresh);
}
function useDemoValue(){
 const [state,setState]=useState<DemoState>(read);
 const stateRef=useRef(state);stateRef.current=state;
 const [notice,setNotice]=useState('');
 const notify=(message:string)=>setNotice(message);
 useEffect(()=>{try{localStorage.setItem(KEY,JSON.stringify(state));}catch{setNotice('浏览器存储不可用，本次修改仅在当前页面保留。');}},[state]);
 useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),4500);return()=>clearTimeout(t);},[notice]);
 const update=(fn:(s:DemoState)=>DemoState)=>setState(s=>fn(s));
 const audit=(s:DemoState,action:string,target:string,result='成功')=>[{id:uid('AUD'),action,target,result,actor:'黄小明',createdAt:now()},...s.audit];
 const mutate=(id:string,fn:(a:Agent)=>Agent,action:string)=>update(s=>({...s,agents:s.agents.map(a=>a.id===id?fn(a):a),audit:audit(s,action,id)}));
 const saveAgent=(id:string,patch:Partial<Agent>)=>{
  const a=state.agents.find(a=>a.id===id);if(!a)return false;
  if(a.status==='pending'){notify('该修订正在审批，请先完成审批。');return false;}
  const skillError=skillBindingError(state,patch.skills??a.skills??[]);if(skillError){notify(skillError);return false;}
  const resources=[...(patch.knowledge??a.knowledge),...(patch.tools??a.tools)];
  if(resources.some(id=>state.resources.find(r=>r.id===id)?.status!=='available')){notify('包含未授权或不可用资源，不能保存。');return false;}
  mutate(id,a=>({...a,...patch,revision:a.revision+1,status:'draft',reviewNote:undefined,updatedAt:'刚刚'}),'保存草稿');notify('草稿已保存，请重新验证。');return true;
 };
 const createAgent=(name:string,description:string)=>{
  const id=uid('AGT');const a:Agent={...structuredClone(initialState.agents.find(a=>a.id==='AGT-004')!),id,name,description,owner:'黄小明',revision:1,knowledge:[],tools:[],skills:[],instructions:'依据获授权的知识回答问题；引用来源；执行敏感业务操作前请求确认。',versions:[],updatedAt:'刚刚'};
  update(s=>({...s,agents:[a,...s.agents],audit:audit(s,'创建 Agent',id)}));notify('已创建 Agent 草稿');return id;
 };
 const testAgent=(id:string,input:string,fail=false,expectedRevision?:number)=>{
  const current=stateRef.current.agents.find(a=>a.id===id);if(!current)return false;
  const revision=expectedRevision??current.revision;
  if(current.revision!==revision){notify('配置修订已变化，本次测试结果不能验证新修订；请重新运行测试。');return false;}
  mutate(id,a=>({...a,testedRevision:revision,testResult:fail?'fail':'pass',testInput:input}),'运行开发验证');
  notify(fail?'模拟验证失败：工具连接超时。':'当前修订验证通过。');return true;
 };
 const submitRelease=(id:string)=>{
  const a=state.agents.find(a=>a.id===id);if(!a)return;
  const skillError=skillBindingError(state,a.skills??[]);if(skillError){notify(skillError);return;}
  if(a.testedRevision!==a.revision||a.testResult!=='pass'){notify('请先对当前配置修订完成验证。');return;}
  if(a.status==='pending'){notify('当前版本已在审批中。');return;}
  if(candidateAssessment(state,a)?.status!=='passed'){notify('请先完成当前草稿的 Guardrail 验证。');return;}
  const approval={id:uid('APR'),type:'release' as const,agentId:id,revision:a.revision,version:a.nextVersion,status:'pending' as const,purpose:'发布到生产环境；审批通过后需独立部署并上架。',createdAt:now(),evidence:{revision:a.revision,input:a.testInput,result:'pass' as const,method:'单次示例输入 · 模拟结果'}};
  update(s=>({...s,agents:s.agents.map(a=>a.id===id?{...a,status:'pending'}:a),approvals:[approval,...s.approvals],audit:audit(s,'提交发布审批',`${id} · ${a.nextVersion}`,'待审')}));notify('发布申请已提交。');
 };
 const requestAccess=(id:string,purpose:string)=>{
  const a=state.agents.find(a=>a.id===id);if(!a||a.access==='pending'||a.access==='granted')return;
  update(s=>({...s,agents:s.agents.map(a=>a.id===id?{...a,access:'pending'}:a),approvals:[{id:uid('ACC'),type:'access',agentId:id,revision:a.revision,version:a.activeVersion||'未知',status:'pending',purpose,createdAt:now()},...s.approvals],audit:audit(s,'申请访问',id,'待审')}));notify('访问申请已提交，等待独立的访问审批。');
 };
 const reviewApproval=(id:string,approve:boolean,note:string)=>{
  const ap=state.approvals.find(x=>x.id===id);if(!ap||ap.status!=='pending')return;
  const a=state.agents.find(a=>a.id===ap.agentId);if(!a)return;
  if(ap.type==='release'&&approve){const error=skillBindingError(state,a.skills??[]);if(error){notify(error);return;}}
  if(ap.type==='release'&&approve&&candidateAssessment(state,a)?.status!=='passed'){notify('当前修订缺少 Guardrail 验证，请先补充评估。');return;}
  if(ap.type==='release'&&approve&&(a.revision!==ap.revision||a.testedRevision!==a.revision||a.testResult!=='pass'||ap.evidence?.revision!==ap.revision||ap.evidence.result!=='pass')){notify('审批证据与当前修订不一致或证据缺失，请重新验证并提交。');return;}
  update(s=>({...s,approvals:s.approvals.map(x=>x.id===id?{...x,status:approve?'approved':'rejected',note}:x),agents:s.agents.map(a=>a.id===ap.agentId?(ap.type==='release'?{...a,status:approve?'approved':'rejected',reviewNote:note}:{...a,access:approve?'granted':'none'}):a),audit:audit(s,ap.type==='release'?'发布审批':'访问审批',id,approve?'批准':'驳回')}));notify(approve?(ap.type==='release'?'发布已批准；请继续部署，审批不会自动上架。':'访问已授权，可返回目录使用。'):'已驳回，意见已保留。');
 };
 const deployAgent=(id:string,fail=false)=>{
  const a=state.agents.find(a=>a.id===id);if(!a||a.status!=='approved'){notify('请先取得当前版本的发布批准。');return;}
  const skillError=skillBindingError(state,a.skills??[]);if(skillError){notify(skillError);return;}
  if(fail){mutate(id,a=>({...a,deployment:'failed'}),'部署失败');notify('模拟部署失败：Runtime 连接超时。已批准版本仍未部署，历史版本记录保留。');return;}
  const approval=state.approvals.find(ap=>ap.type==='release'&&ap.agentId===id&&ap.status==='approved'&&ap.revision===a.revision&&ap.version===a.nextVersion);
  if(!approval?.evidence||approval.evidence.revision!==a.revision||approval.evidence.result!=='pass'){notify('缺少匹配的发布验证证据，请重新验证并取得发布批准。');return;}
  if(candidateAssessment(state,a)?.status!=='passed'){notify('请先完成当前草稿的 Guardrail 验证。');return;}
  const ver={version:a.nextVersion,revision:a.revision,releaseId:uid('REL'),name:a.name,instructions:a.instructions,model:a.model,knowledge:[...a.knowledge],tools:[...a.tools],skills:[...(a.skills??[])],skillSnapshots:snapshotSkills(state,a.skills??[]),createdAt:now(),evidence:structuredClone(approval.evidence)};
  const parts=a.nextVersion.replace('v','').split('.').map(Number);const next=`v${parts[0]}.${parts[1]+1}.0`;
  update(s=>({...s,governance:deployGovernance(s,a,ver.releaseId),agents:s.agents.map(x=>x.id===id?{...x,status:'delivered',activeVersion:ver.version,versions:[ver,...x.versions],nextVersion:next,deployment:'available',enabled:true}:x),audit:audit(s,'部署版本',id)}));notify('部署完成。');
 };
 const toggleCatalog=(id:string)=>{
  const a=state.agents.find(a=>a.id===id);if(!a)return;
  if(a.catalog==='unlisted'&&(!a.activeVersion||a.deployment!=='available'||!a.enabled)){notify('只有已部署且可用的版本才能上架。');return;}
  mutate(id,a=>({...a,catalog:a.catalog==='listed'?'unlisted':'listed'}),a.catalog==='listed'?'目录下架':'目录上架');notify(a.catalog==='listed'?'目录已下架，历史任务与授权保留。':'已上架到 User Portal。');
 };
 const toggleEnabled=(id:string)=>{const a=state.agents.find(a=>a.id===id);if(!a)return;if(!a.activeVersion){notify('尚无已部署版本，请先完成发布与部署。');return;}mutate(id,a=>({...a,enabled:!a.enabled,deployment:a.enabled?'stopped':'available'}),a.enabled?'停用服务':'恢复服务');notify(a.enabled?'服务已停用，阻止新任务；在途任务按演示规则继续。':'服务已恢复。');};
 const revokeAccess=(id:string)=>{mutate(id,a=>({...a,access:'revoked'}),'撤销访问授权');notify('访问已撤销，新任务将被拒绝，历史任务保留。');};
 const startRun=(id:string,input:string,scenario:Run['scenario']='normal',meta:Pick<Run,'subtaskInputs'|'sourceSeq'|'workId'|'conversationId'|'goalRevision'|'subtaskId'|'initiatorId'|'initiatorName'|'capability'>={})=>{
  const a=state.agents.find(a=>a.id===id);
  if(!a||a.access!=='granted'||!a.enabled||a.deployment!=='available'||!a.activeVersion){notify('无法发起任务：请检查使用权限与服务可用状态。');return null;}
  const skillGate=skillExecutionGate(stateRef.current,id);if(!skillGate.allowed){notify(skillGate.reason);return null;}
  const gate=governanceGate(stateRef.current,id,meta.capability??(scenario==='approval'?'protected-action':'general'));if(!gate.allowed){notify(gate.reason);return null;}
  if(!input.trim()){notify('请先填写任务内容。');return null;}
  const runId=uid('RUN');const ver=a.versions.find(v=>v.version===a.activeVersion);
  const run:Run={...meta,capability:meta.capability??(scenario==='approval'?'protected-action':'general'),id:runId,agentId:id,version:a.activeVersion,releaseId:ver?.releaseId||'未知',deploymentId:`DEP-${id}`,sessionId:uid('SES'),input:input.trim(),status:'queued',result:'',reason:'',createdAt:now(),events:[{label:'任务已接收，访问权限校验通过',time:now()}],confirmed:false,scenario};
  update(s=>({...s,runs:[run,...s.runs],audit:audit(s,'发起任务',runId)}));return runId;
 };
 useEffect(()=>{
  const timers=state.runs.filter(r=>r.status==='queued'||r.status==='running').map(run=>setTimeout(()=>update(s=>({...s,runs:s.runs.map(r=>{
   if(r.id!==run.id||r.status!==run.status)return r;
   const checked=enforceRunGovernance(s,r,now());if(checked.status==='blocked')return checked;
   if(r.status==='queued')return {...r,status:'running',events:[...r.events,{label:'输入检查通过，检索获授权知识',time:now()}]};
   const outcomes={normal:'success',approval:'waiting',failure:'failed',guardrail:'blocked',timeout:'timeout'} as const;const status=outcomes[r.scenario];
   const agent=s.agents.find(a=>a.id===r.agentId);
   const result=r.workId&&agent?.id==='AGT-007'?'已完成经营分析框架：按收入、毛利与渠道维度核对变化；缺失口径列入待确认事项，不推断未提供的数据。':r.workId&&agent?.id==='AGT-008'?'已整合任务目标与可用分析，形成经营概览、渠道对比、风险与下一步行动四个章节的报告草稿。':r.workId&&agent?.id==='AGT-002'?'已梳理任务共享资料与统计口径，区分已确认事实、成员建议与待决策项，完成资料整理。':agent?.icon==='knowledge'?'已检索员工知识手册，整理以下参考信息。\n\n你的问题：'+r.input+'\n\n1. 根据事项类型准备申请记录、相关凭证与必要说明。\n2. 在员工服务入口核对适用流程和材料清单。\n3. 涉及费用时，先确认预算归属与适用审批人。\n\n依据：《员工知识手册》相关流程说明。':agent?.icon==='contract'?'合同审阅要点（模拟）\n\n任务：'+r.input+'\n\n建议重点核对：付款条件与验收标准、违约责任、保密条款、解除条件及争议解决方式。请由获授权法务人员结合完整文本复核。\n\n引用：采购管理制度中的合同管理说明（示例）。未执行任何合同业务操作。':'已根据采购管理制度完成需求整理。\n\n采购需求：'+r.input+'\n\n建议流程\n1. 明确采购用途与设备配置，确认预算归属。\n2. 提交部门负责人及预算负责人审批。\n3. 由采购部门核价并进入采购流程。\n\n依据：《采购管理制度》第 3.2 节。';
   const reason=status==='failed'?'执行工具连接超时，本次模拟未完成外部动作。':status==='blocked'?'输入包含受限敏感信息，演示策略已拦截本次请求。':status==='timeout'?'运行超过演示时限，任务已超时；未执行外部业务操作。':'';
   const adopted=r.subtaskInputs?.length?`\n\n本次采用：${r.subtaskInputs.map(i=>`${i.title||'依赖成果'} v${i.version}`).join('、')}。`:'';
   return {...r,status,result:status==='success'?result+adopted:'',reason,events:[...r.events,{label:status==='waiting'?'已生成采购申请草稿，等待人工确认':status==='success'?'输出检查通过，任务完成':reason,time:now()}]};
  })})),run.status==='queued'?600:1800));return()=>timers.forEach(clearTimeout);
 },[state.runs,state.governance]);
 const confirmRun=(id:string,decision:'approve'|'reject'|'timeout')=>{
  const r=state.runs.find(r=>r.id===id);if(!r||r.status!=='waiting'||r.confirmed){notify('该确认已处理，不会重复执行。');return;}
  if(decision==='approve'){const skillGate=skillExecutionGate(stateRef.current,r.agentId,r.releaseId);if(!skillGate.allowed){notify(skillGate.reason);return;}const gate=governanceGate(stateRef.current,r.agentId,'protected-action',r.releaseId);if(!gate.allowed){notify(gate.reason);return;}}
  update(s=>({...s,runs:s.runs.map(r=>r.id===id?{...r,status:decision==='approve'?'success':decision==='reject'?'cancelled':'timeout',confirmed:true,result:decision==='approve'?'采购申请草稿已确认提交（模拟）。\n申请内容：'+r.input+'\n确认人：黄小明\n':'',reason:decision==='reject'?'确认人拒绝提交，任务已取消，未执行受保护动作。':decision==='timeout'?'人工确认已超时，未执行受保护动作。':'',events:[...r.events,{label:decision==='approve'?'黄小明确认提交（模拟），执行一次':decision==='reject'?'黄小明拒绝执行':'人工确认超时',time:now()}]}:r),audit:audit(s,'执行确认',id,decision==='approve'?'确认':decision==='reject'?'拒绝':'超时')}));notify('执行确认已处理并记录。');
 };
 const addFeedback=(runId:string,category:string,text:string)=>{const r=state.runs.find(r=>r.id===runId);if(!r||!text.trim())return;update(s=>({...s,feedback:[{id:uid('FB'),runId,version:r.version,agentId:r.agentId,category,text,status:'open',createdAt:now()},...s.feedback],audit:audit(s,'提交任务反馈',runId)}));notify('反馈已提交，关联当前 Run 与实际运行版本。');};
 const resolveFeedback=(id:string)=>{update(s=>({...s,feedback:s.feedback.map(f=>f.id===id?{...f,status:'resolved'}:f),audit:audit(s,'处理反馈',id)}));notify('反馈已标记为处理完成。');};
 const assessGovernance=(id:string,fail=false)=>{const a=stateRef.current.agents.find(a=>a.id===id);if(!a)return;update(s=>({...assessCandidate(s,a,fail,now()),audit:audit(s,'模拟 Guardrail 验证',`${id} · r${a.revision}`)}));notify('当前草稿的模拟 Guardrail 验证已记录；生产版本不受草稿结果影响。');};
 const governanceAction=(action:GovernanceAction)=>{try{const next=transitionGovernance(stateRef.current,action,now());
  // Recheck queued, in-flight and waiting runs in the same state update as revocation.
  next.runs=next.runs.map(r=>enforceRunGovernance(next,r,now()));
  next.audit=audit(next,'Guardrail '+action.type,action.type==='simulate'?action.agentId:action.issueId,'模拟流程');setState(next);stateRef.current=next;notify('治理事件已记录，使用范围与待办已同步。');return true;}catch(error){notify(error instanceof Error?error.message:'无法处理治理事件。');return false;}};
 const reportGovernanceFeedback=(runId:string,text:string)=>{const r=stateRef.current.runs.find(r=>r.id===runId);if(!r||r.status!=='blocked'||r.scenario!=='guardrail'||!text.trim())return false;const result=governanceAction({type:'simulate',agentId:r.agentId,releaseId:r.releaseId,scenario:'false-positive',sourceRunId:r.id,description:text.trim()});if(result)addFeedback(runId,'疑似误报',text.trim());return result;};
 const reset=()=>{try{Object.keys(sessionStorage).filter(k=>k.startsWith('agent-wizard-unsaved-')).forEach(k=>sessionStorage.removeItem(k));localStorage.removeItem('agent-wizard-favorites');}catch{}const fresh=structuredClone(initialState);fresh.governance=ensureGovernance(fresh);for(const a of fresh.agents.filter(a=>a.status==='pending'))fresh.governance=assessCandidate(fresh,a).governance;setState(fresh);notify('已恢复初始演示数据。');};
 const recordWorkEvent=(action:string,target:string,actor:string,result='成功')=>update(s=>({...s,audit:[{id:uid('AUD'),action,target,actor,result,createdAt:now()},...s.audit]}));
 const linkWorkRuns=(links:{id:string;workId:string;conversationId:string;goalRevision:number;subtaskId?:string}[])=>update(s=>({...s,runs:s.runs.map(r=>{const link=links.find(x=>x.id===r.id);return link&&!r.conversationId?{...r,...link}:r;})}));
 return {assessGovernance,governanceAction,reportGovernanceFeedback,recordWorkEvent,linkWorkRuns,state,notice,notify,saveAgent,createAgent,testAgent,submitRelease,requestAccess,reviewApproval,deployAgent,toggleCatalog,toggleEnabled,revokeAccess,startRun,confirmRun,addFeedback,resolveFeedback,reset};
}
const Context=createContext<ReturnType<typeof useDemoValue>|null>(null);
export function DemoProvider({children}:{children:ReactNode}){return <Context.Provider value={useDemoValue()}>{children}</Context.Provider>}
export function useDemo(){const c=useContext(Context);if(!c)throw new Error('DemoProvider missing');return c;}
