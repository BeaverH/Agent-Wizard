import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {useDemo} from './store';
import type {Run} from './model';
import {governanceGate} from './governance';
import {applyWorkCommand,appendMessage,recalculate,invalidateReview,recordSubtaskResult,type WorkCommand} from './work-engine';
import {initialWorkState,snapshotAgents} from './work-seed';
import {people,teams,authorName,canWrite,canSeeWorkItem,migrateWorkConversations,mainConversationId,taskContext,taskReadiness,type WorkState,type Work,type NewWorkInput,type MemberRole} from './work-model';
const KEY='agent-wizard-collaboration-v2';
function useWorkValue(){
 const demo=useDemo();
 const [state,setState]=useState<WorkState>(()=>{try{const s=JSON.parse(localStorage.getItem(KEY)||'null');if(s?.schema===2&&Array.isArray(s.works))return {...s,works:s.works.map(migrateWorkConversations)};}catch{}return initialWorkState(demo.state.agents);});
 const ref=useRef(state);ref.current=state;
 useEffect(()=>{try{localStorage.setItem(KEY,JSON.stringify(state));}catch{demo.notify('协作记录无法写入浏览器存储。');}},[state]);
 const setActorId=(actorId:string)=>{if(!people.some(p=>p.id===actorId))return;const next={...ref.current,actorId};ref.current=next;setState(next);};
 const commit=(workId:string,command:WorkCommand,auditLabel?:string)=>{
  const current=ref.current;const work=current.works.find(w=>w.id===workId);if(!work){demo.notify('任务不存在。');return false;}
  const result=applyWorkCommand(work,current.actorId,command);
  if(!result.work){demo.notify(result.error||'操作未完成。');return false;}
  const next={...current,works:current.works.map(w=>w.id===workId?result.work!:w)};ref.current=next;setState(next);
  if(auditLabel)demo.recordWorkEvent(auditLabel,workId,authorName(current.actorId));
  return true;
 };
 const createWork=(input:NewWorkInput)=>{
  if(!input.title.trim()||!input.goal.trim()||!input.deliverableTitle.trim()){demo.notify('请填写任务名称、目标和主交付物。');return null;}
  const team=input.executorType==='team'?teams.find(t=>t.id===input.executorId):undefined;
  if(input.executorType==='team'&&!team){demo.notify('团队不存在。');return null;}
  const ids=team?.agentIds||[input.executorId];const coordinator=team?.coordinatorId||input.executorId;
  const governanceBlock=ids.map(id=>({agent:demo.state.agents.find(a=>a.id===id),gate:governanceGate(demo.state,id)})).find(item=>!item.gate.allowed);
  if(governanceBlock){demo.notify(`${governanceBlock.agent?.name||'执行者'}：${governanceBlock.gate.reason}`);return null;}
  const blocked=ids.map(id=>demo.state.agents.find(a=>a.id===id)).find(a=>!a||a.access!=='granted'||!a.enabled||a.deployment!=='available'||!a.activeVersion);
  if(blocked||ids.some(id=>!demo.state.agents.some(a=>a.id===id))){demo.notify(`执行者未授权或服务不可用${blocked?'：'+blocked.name:''}。`);return null;}
  const agents=snapshotAgents(demo.state.agents,ids,coordinator);
  const work=makeNew(input,ref.current.actorId,agents,team?.version);
  const next={...ref.current,works:[work,...ref.current.works]};ref.current=next;setState(next);demo.recordWorkEvent('创建协作任务',work.id,authorName(next.actorId));demo.notify('任务已创建。');return work.id;
 };
 const sendMessage=(workId:string,text:string,mentionId?:string,conversationId?:string)=>{commit(workId,{type:'message',text,mentionId,conversationId});};
 const createConversation=(workId:string,title:string,agentIds:string[])=>{const id=`CHAT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,7)}`;return commit(workId,{type:'create-conversation',id,title,agentIds},'创建专题会话')?id:null;};
 const publishConclusion=(workId:string,conversationId:string,text:string,sourceMessageId:string)=>{const ok=commit(workId,{type:'publish-conclusion',conversationId,text,sourceMessageId},'提交专题结论');if(ok)demo.notify('已提交到总协作。');return ok;};
 const referenceMessage=(workId:string,conversationId:string,sourceMessageId:string)=>{const ok=commit(workId,{type:'reference-message',conversationId,sourceMessageId},'引用会话消息');if(ok)demo.notify('已引用到目标会话。');return ok;};
 const inviteMember=(workId:string,personId:string,role:MemberRole,history:'all'|'from_join')=>{if(commit(workId,{type:'invite',personId,role,history},'邀请任务成员'))demo.notify('成员已加入任务。');};
 const removeMember=(workId:string,personId:string)=>{if(commit(workId,{type:'remove',personId},'移除任务成员'))demo.notify('已移除成员，后续访问被拒绝。');};
 const assignSubtask=(workId:string,title:string,assigneeId:string,conversationId?:string,dependsOn?:string[])=>{if(commit(workId,{type:'assign',title,assigneeId,conversationId,dependsOn},'派发子任务'))demo.notify('子任务已派发。');};
 const updateSubtaskDependencies=(workId:string,subtaskId:string,dependsOn:string[])=>{const ok=commit(workId,{type:'set-dependencies',subtaskId,dependsOn},'更新子任务依赖');if(ok)demo.notify('依赖已更新。');return ok;};
 const saveSubtaskResult=(workId:string,subtaskId:string,content:string)=>{const ok=commit(workId,{type:'save-result',subtaskId,content},'提交子任务成果版本');if(ok)demo.notify('成果已提交到任务共享上下文。');return ok;};
 const startSubtask=(workId:string,subtaskId:string,scenario:Run['scenario']='normal')=>{
  if(scenario==='approval'){demo.notify('业务动作需从业务执行确认入口发起。');return null;}
  const {actorId}=ref.current;const w=ref.current.works.find(w=>w.id===workId);const t=w?.subtasks.find(t=>t.id===subtaskId);
  if(!w||!t||!canWrite(w,actorId)||!canSeeWorkItem(w,actorId,t)||!(t.status==='todo'||t.status==='blocked'||t.status==='done'&&taskReadiness(w,t)==='outdated')||t.goalRevision!==w.goalRevision||w.status==='completed'){demo.notify('当前身份或子任务状态不允许启动。');return null;}
  const check=applyWorkCommand(w,actorId,{type:'start',subtaskId,runId:'PRECHECK'});
  if(check.error){demo.notify(check.error);return null;}
  const executor=w.agents.find(a=>a.agentId===t.assigneeId);const current=demo.state.agents.find(a=>a.id===t.assigneeId);
  if(!executor||current?.activeVersion!==executor.version){demo.notify('执行者版本已变化，请负责人重新确认执行范围。');return null;}
  const capability=w.decisions.some(d=>d.kind==='business'&&!!d.runId&&(d.runId===t.runId||t.runIds?.includes(d.runId)))?'protected-action':'general';
  const governance=governanceGate(demo.state,t.assigneeId,capability,executor.releaseId);
  if(!governance.allowed){demo.notify(governance.reason);return null;}
  if(w.materials.some(m=>!canSeeWorkItem(w,actorId,m))){demo.notify('执行需要的资料不在当前历史范围内，请联系负责人。');return null;}
  const conversationId=t.conversationId||mainConversationId(w);const context=taskContext(w,actorId,t.id);
  if(!context){demo.notify('来源会话不存在。');return null;}
  const runId=demo.startRun(t.assigneeId,`${context.input}\n\n执行子任务：${t.title}`,scenario,{workId,conversationId,goalRevision:w.goalRevision,subtaskId,subtaskInputs:structuredClone(context.inputs),sourceSeq:Math.min(t.seq,context.sourceSeq),initiatorId:actorId,initiatorName:authorName(actorId),capability});
  if(!runId)return null;commit(workId,{type:'start',subtaskId,runId,sourceSeq:Math.min(t.seq,context.sourceSeq),inputs:context.inputs},'启动任务执行');return runId;
 };
 const completeHumanSubtask=(workId:string,subtaskId:string,result:string)=>{if(commit(workId,{type:'human-result',subtaskId,result},'提交子任务结果'))demo.notify('结果已提交。');};
 const proposeDecision=(workId:string,kind:'goal'|'scope',detail:string,newGoal?:string,rebindAgents?:boolean)=>{if(commit(workId,{type:'propose',kind,detail,newGoal,rebindAgents},'提出任务变更'))demo.notify('变更已提交，等待负责人确认。');};
 const requestBusiness=(workId:string,detail:string)=>{const w=ref.current.works.find(w=>w.id===workId);const coordinator=w?.agents.find(a=>a.role==='coordinator')||w?.agents[0];if(!coordinator)return;const gate=governanceGate(demo.state,coordinator.agentId,'protected-action',coordinator.releaseId);if(!gate.allowed){demo.notify(gate.reason);return;}if(commit(workId,{type:'business',detail},'请求业务执行确认'))demo.notify('已请求负责人确认业务动作。');};
 const resolveDecision=(workId:string,decisionId:string,approve:boolean)=>{
  const s=ref.current;const w=s.works.find(w=>w.id===workId);const d=w?.decisions.find(d=>d.id===decisionId);if(!w||!d)return;
  let rebound:typeof w.agents|undefined;
  if(approve&&d.kind==='scope'&&d.rebindAgents){const current=w.agents.map(a=>demo.state.agents.find(x=>x.id===a.agentId));if(current.some(a=>!a||a.access!=='granted'||!a.enabled||a.deployment!=='available'||!a.activeVersion||!governanceGate(demo.state,a.id).allowed)){demo.notify('执行者未授权或暂不可用，不能重新绑定。');return;}rebound=snapshotAgents(demo.state.agents,w.agents.map(a=>a.agentId),w.agents.find(a=>a.role==='coordinator')?.agentId||w.agents[0].agentId);}
  const check=applyWorkCommand(w,s.actorId,{type:'resolve',decisionId,approve,runId:d.kind==='business'&&approve?'PRECHECK':undefined,agentSnapshots:rebound});
  if(check.error){demo.notify(check.error);return;}
  let runId:string|undefined;
  if(approve&&d.kind==='business'){
   const coordinator=w.agents.find(a=>a.role==='coordinator')||w.agents[0];
   const governance=governanceGate(demo.state,coordinator.agentId,'protected-action',coordinator.releaseId);
   if(!governance.allowed){demo.notify(governance.reason);return;}
   if(demo.state.agents.find(a=>a.id===coordinator.agentId)?.activeVersion!==coordinator.version){demo.notify('执行者版本已变化，请先申请重新绑定执行范围。');return;}
   const started=demo.startRun(coordinator.agentId,`经负责人 ${authorName(s.actorId)} 确认的业务动作：${d.detail}`,'normal',{workId,conversationId:mainConversationId(w),goalRevision:w.goalRevision,sourceSeq:d.seq,initiatorId:s.actorId,initiatorName:authorName(s.actorId),capability:'protected-action'});
   if(!started)return;runId=started;
  }
  if(commit(workId,{type:'resolve',decisionId,approve,runId,agentSnapshots:rebound},approve?'批准任务决策':'驳回任务决策'))demo.notify(approve?'已确认。':'已驳回。');
 };
 const addMaterial=(workId:string,data:{name:string;detail:string;source:'upload'|'knowledge';restricted?:boolean})=>{if(commit(workId,{type:'material',...data},'共享任务资料'))demo.notify('资料已共享给任务成员。');};
 const assembleArtifact=(workId:string)=>{if(commit(workId,{type:'assemble'},'汇总主交付物'))demo.notify('成果新版本已提交验收。');};
 const saveArtifactVersion=(workId:string,content:string,title?:string)=>{if(commit(workId,{type:'artifact',content,title},'提交成果版本'))demo.notify('成果新版本已提交。');};
 const acceptArtifact=(workId:string,artifactId:string)=>{if(commit(workId,{type:'accept',artifactId},'验收主交付物'))demo.notify('成果已验收，任务完成。');};
 const resetWorks=()=>{const next=initialWorkState(demo.state.agents);ref.current=next;setState(next);};
 useEffect(()=>{
  const links=state.works.flatMap(w=>[...w.subtasks.flatMap(t=>[...new Set([...(t.runIds||[]),...(t.runId?[t.runId]:[])])].map(id=>({id,workId:w.id,conversationId:t.conversationId||mainConversationId(w),goalRevision:t.goalRevision,subtaskId:t.id}))),...w.decisions.filter(d=>d.runId).map(d=>({id:d.runId!,workId:w.id,conversationId:mainConversationId(w),goalRevision:d.goalRevision}))]).filter(link=>demo.state.runs.some(r=>r.id===link.id&&!r.conversationId));
  if(links.length)demo.linkWorkRuns(links);
 },[state.works,demo.state.runs]);
 useEffect(()=>{
  const s=ref.current;let changed=false;
  const works=s.works.map(original=>{
   let w:Work|undefined;
   original.subtasks.filter(t=>t.status==='running'&&t.runId).forEach(t=>{
    const run=demo.state.runs.find(r=>r.id===t.runId);if(!run||!['success','failed','blocked','cancelled','timeout'].includes(run.status))return;
    w??=structuredClone(original);const target=w.subtasks.find(x=>x.id===t.id)!;
    target.sourceSeq=Math.min(target.seq,run.sourceSeq??target.sourceSeq??target.seq);
    if(run.status==='success'&&target.goalRevision===w.goalRevision)recordSubtaskResult(w,target,run.result,run.agentId,run.id,run.subtaskInputs||target.inputs||[]);
    else {target.status='blocked';target.result=run.reason||run.result;}
    const agent=w.agents.find(a=>a.agentId===t.assigneeId);
    appendMessage(w,t.assigneeId,agent?.name||authorName(t.assigneeId),'agent',`${target.status==='done'?'完成':'未完成'}「${t.title}」\n${target.result}`,undefined,t.conversationId);w.messages[w.messages.length-1].sourceSeq=run.sourceSeq??t.seq;w.messages[w.messages.length-1].goalRevision=run.goalRevision??t.goalRevision;invalidateReview(w);changed=true;
   });
   return w?recalculate(w):original;
  });
  if(changed){const next={...s,works};ref.current=next;setState(next);}
 },[demo.state.runs,state.works]);
 return {state,actorId:state.actorId,setActorId,createWork,createConversation,publishConclusion,referenceMessage,sendMessage,inviteMember,removeMember,assignSubtask,updateSubtaskDependencies,saveSubtaskResult,startSubtask,completeHumanSubtask,proposeDecision,resolveDecision,requestBusiness,assembleArtifact,saveArtifactVersion,acceptArtifact,addMaterial,resetWorks};
}
import {makeWork as makeNew} from './work-engine';
const WorkContext=createContext<ReturnType<typeof useWorkValue>|null>(null);
export function WorkProvider({children}:{children:ReactNode}){return <WorkContext.Provider value={useWorkValue()}>{children}</WorkContext.Provider>}
export function useWorks(){const c=useContext(WorkContext);if(!c)throw new Error('WorkProvider missing');return c;}
