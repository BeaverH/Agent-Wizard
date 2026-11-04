import {skillExecutionGate} from './skill-model.ts';
import type { Agent, DemoState, Run } from './model';

export type Readiness = 'ready' | 'limited' | 'not-ready';
export type Risk = 'low' | 'medium' | 'high' | 'unknown';
export type Capability = 'general' | 'protected-action';
export interface GovernanceBinding { id:string;profileId:string;profileVersion:string;guardrailId:string;guardrailName:string;guardrailVersion:string;policyId:string;policyName:string;policyVersion:string;scope:'all'|'protected-action';status:'active'|'revoked'|'pending' }
export interface GovernanceAssessment {reportId:string;revision:number;status:'passed'|'failed'|'pending';risk:Risk;assessedAt:string;method:string}
export interface GovernanceRecord {agentId:string;releaseId:string;version:string;bindings:GovernanceBinding[];assessment:GovernanceAssessment}
export interface GovernanceIssue {id:string;agentId:string;releaseId:string;version:string;kind:'false-positive'|'policy-revoked'|'critical';status:'open'|'acknowledged'|'remediating'|'validating'|'awaiting-approval'|'resolved';title:string;reason:string;owner:string;manager:string;createdAt:string;dueAt:string;bindingId?:string;previousBinding?:GovernanceBinding;sourceRunId?:string;events:{label:string;time:string}[];replacementReady:boolean;validationPassed:boolean}
export interface GovernanceState {records:GovernanceRecord[];issues:GovernanceIssue[];sequence:number}
export interface GovernanceView {readiness:Readiness;risk:Risk;reason:string;userReason:string;restrictions:string[];bindings:GovernanceBinding[];assessment:GovernanceAssessment|null;issues:GovernanceIssue[];version:string|null;releaseId:string|null}
export const readinessLabels:Record<Readiness,string>={ready:'Ready',limited:'Limited','not-ready':'Not Ready'};
export const portalReadinessLabels:Record<Readiness,string>={ready:'可用',limited:'仅支持查询','not-ready':'暂不可用'};
export const riskLabels:Record<Risk,string>={low:'低风险',medium:'中风险',high:'高风险',unknown:'未评估'};
export const issueStatusLabels:Record<GovernanceIssue['status'],string>={open:'待响应',acknowledged:'已响应',remediating:'整改中',validating:'待复测','awaiting-approval':'待签署',resolved:'已解决'};
export type GovernanceAction = {type:'simulate';agentId:string;scenario:'false-positive'|'revoke-required'|'revoke-action'|'critical'|'revoke-shared';releaseId?:string;sourceRunId?:string;description?:string} | {type:'acknowledge'|'replace'|'retest'|'approve-recovery'|'dismiss-feedback';issueId:string};
const seedTime='2026/11/04 10:00:00';
function bindings(agent:Agent):GovernanceBinding[]{return [
 {id:`BIND-${agent.id}-INPUT`,profileId:`PRF-${agent.id}`,profileVersion:'1.0',guardrailId:'GR-PII',guardrailName:'企业敏感信息保护',guardrailVersion:'3.2',policyId:'POL-PII-001',policyName:'敏感信息检查',policyVersion:'1.4',scope:'all',status:'active'},
 {id:`BIND-${agent.id}-ACTION`,profileId:`PRF-${agent.id}`,profileVersion:'1.0',guardrailId:'GR-ACTION',guardrailName:'业务动作保护',guardrailVersion:'2.1',policyId:`POL-ACTION-${agent.id}`,policyName:'敏感动作与人工确认',policyVersion:'1.0',scope:'protected-action',status:'active'},
];}
function seedRecord(agent:Agent,releaseId:string,version:string,revision:number):GovernanceRecord{return {agentId:agent.id,releaseId,version,bindings:bindings(agent),assessment:{reportId:`MEA-${agent.id}-${revision}`,revision,status:'passed',risk:'low',assessedAt:seedTime,method:'Guardrail Measure · 演示评估'}};}
export function ensureGovernance(state:DemoState):GovernanceState {
 if(state.governance)return state.governance;
 const records=state.agents.flatMap(a=>a.versions.map(v=>seedRecord(a,v.releaseId,v.version,v.revision)));
 const issues:GovernanceIssue[]=[];
 const contract=records.find(r=>r.agentId==='AGT-003'&&r.version===state.agents.find(a=>a.id==='AGT-003')?.activeVersion);
 if(contract){const b=contract.bindings.find(b=>b.scope==='protected-action')!;b.status='revoked';contract.assessment.risk='medium';issues.push({id:'GOV-SEED-001',agentId:'AGT-003',releaseId:contract.releaseId,version:contract.version,kind:'policy-revoked',status:'open',title:'敏感动作防护已撤销',reason:'演示事件：动作防护需替换；只读查询仍可使用。',owner:state.agents.find(a=>a.id==='AGT-003')!.owner,manager:'黄小明',createdAt:seedTime,dueAt:'2026/11/05 18:00:00',bindingId:b.id,events:[{label:'演示事件：撤销动作防护，暂停敏感业务操作',time:seedTime}],replacementReady:false,validationPassed:false});}
 return {records,issues,sequence:1};
}
export const getGovernanceIssues=(state:DemoState)=>ensureGovernance(state).issues;
export function getAgentGovernance(state:DemoState,agent:Agent,releaseId?:string):GovernanceView {
 const version=releaseId?agent.versions.find(v=>v.releaseId===releaseId):agent.versions.find(v=>v.version===agent.activeVersion);
 const record=ensureGovernance(state).records.find(r=>r.agentId===agent.id&&r.releaseId===version?.releaseId);
 const issues=ensureGovernance(state).issues.filter(i=>i.agentId===agent.id&&i.releaseId===version?.releaseId);
 const critical=issues.some(i=>i.kind==='critical'&&i.status!=='resolved');
 const allGap=record?.bindings.some(b=>b.scope==='all'&&b.status!=='active');
 const actionGap=record?.bindings.some(b=>b.scope==='protected-action'&&b.status!=='active');
 const unknown=!record||record.assessment.status!=='passed'||record.assessment.revision!==version?.revision;
 const readiness:Readiness=critical||allGap||unknown?'not-ready':actionGap?'limited':'ready';
 const reason=critical?'已确认严重风险，当前版本暂停执行':allGap?'必需防护失效，等待替换与复测':unknown?'当前运行版本缺少有效防护评估':actionGap?'动作防护失效，仅允许只读查询':'防护与评估有效';
 const userReason=readiness==='not-ready'?'该 Agent 正在维护，暂时无法执行任务。历史内容仍可查看。':readiness==='limited'?'目前仅支持查询，涉及业务提交的操作已暂停。':'可在已授权范围内使用';
 return {readiness,risk:critical?'high':record?.assessment.risk??'unknown',reason,userReason,restrictions:readiness==='not-ready'?['暂停新执行及继续执行']:readiness==='limited'?['仅支持只读查询','暂停业务提交与敏感工具动作']:[],bindings:record?.bindings??[],assessment:record?.assessment??null,issues,version:version?.version??null,releaseId:version?.releaseId??null};
}
export function governanceGate(state:DemoState,agentId:string,capability:Capability='general',releaseId?:string):{allowed:boolean;reason:string}{
 const agent=state.agents.find(a=>a.id===agentId);if(!agent)return {allowed:false,reason:'Agent 不存在。'};
 const g=getAgentGovernance(state,agent,releaseId);
 if(g.readiness==='not-ready')return {allowed:false,reason:g.userReason};
 if(g.readiness==='limited'&&capability==='protected-action')return {allowed:false,reason:'当前仅支持查询，业务提交与敏感工具操作已暂停。'};
 return {allowed:true,reason:''};
}
export function governanceImpact(state:DemoState,agentId:string,shared=false):Agent[]{
 const a=state.agents.find(a=>a.id===agentId);if(!a)return [];
 return shared?state.agents.filter(a=>!!a.activeVersion&&getAgentGovernance(state,a).bindings.some(b=>b.guardrailId==='GR-PII')):[a];
}
export function enforceRunGovernance(state:DemoState,run:Run,time:string):Run{
 if(!['queued','running','waiting'].includes(run.status))return run;
 const capability=run.status==='waiting'||run.scenario==='approval'?'protected-action':run.capability??'general';
 const governance=governanceGate(state,run.agentId,capability,run.releaseId);
 const gate=governance.allowed?skillExecutionGate(state,run.agentId,run.releaseId):governance;
 return gate.allowed?run:{...run,status:'blocked',result:'',reason:gate.reason,events:[...run.events,{label:'治理检查：'+gate.reason,time}]};
}
export function transitionGovernance(state:DemoState,action:GovernanceAction,time:string):DemoState {
 const gov=structuredClone(ensureGovernance(state));
 if(action.type==='simulate'){
  const targets=governanceImpact(state,action.agentId,action.scenario==='revoke-shared');
  if(!targets.length)throw new Error('请先选择有运行版本的 Agent。');
  for(const agent of targets){
   const release=agent.versions.find(v=>action.releaseId?v.releaseId===action.releaseId:v.version===agent.activeVersion);const record=gov.records.find(r=>r.releaseId===release?.releaseId&&r.agentId===agent.id);
   if(!record)throw new Error('该 Agent 尚无可评估的生产版本。');
   const kind=action.scenario==='false-positive'?'false-positive':action.scenario==='critical'?'critical':'policy-revoked';
   const binding=kind==='policy-revoked'?record.bindings.find(b=>b.scope===(action.scenario==='revoke-action'?'protected-action':'all')):undefined;
   if(gov.issues.some(i=>i.agentId===agent.id&&i.releaseId===record.releaseId&&i.kind===kind&&i.bindingId===binding?.id&&i.status!=='resolved'))continue;
   const previousBinding=binding?structuredClone(binding):undefined;
   if(binding){for(const linked of gov.records.filter(r=>r.agentId===agent.id)){for(const b of linked.bindings.filter(b=>b.id===binding.id&&b.policyVersion===binding.policyVersion)){b.status='revoked';}if(linked.releaseId.startsWith('candidate:'))linked.assessment.status='pending';}}
   if(kind==='critical'){for(const candidate of gov.records.filter(r=>r.agentId===agent.id&&r.releaseId.startsWith('candidate:')))candidate.assessment.status='pending';}
   if(kind==='critical'){record.assessment.status='failed';record.assessment.risk='high';}
   else if(kind==='policy-revoked')record.assessment.risk='unknown';
   const title=kind==='false-positive'?'疑似误报待调查':kind==='critical'?'严重风险待整改':binding?.scope==='protected-action'?'敏感动作防护已撤销':'必需防护已撤销';
   const day=new Date();day.setDate(day.getDate()+1);
   gov.issues.unshift({id:`GOV-${++gov.sequence}-${agent.id}`,agentId:agent.id,releaseId:record.releaseId,version:record.version,kind,status:'open',title,reason:action.description||`演示事件：${title}。`,owner:agent.owner,manager:'黄小明',createdAt:time,dueAt:day.toLocaleString('zh-CN',{hour12:false}),bindingId:binding?.id,previousBinding,sourceRunId:action.sourceRunId,events:[{label:kind==='false-positive'?'收到疑似误报，保持当前使用范围':`${title}，已同步限制执行`,time}],replacementReady:false,validationPassed:false});
  }
 }else{
  const issue=gov.issues.find(i=>i.id===action.issueId);if(!issue||issue.status==='resolved')throw new Error('该整改项已处理或不存在。');
  const record=gov.records.find(r=>r.agentId===issue.agentId&&r.releaseId===issue.releaseId);if(!record)throw new Error('缺少关联运行版本。');
  let label='';
  if(action.type==='acknowledge'){if(issue.status!=='open')throw new Error('已响应该事件。');issue.status='acknowledged';label='Manager 已响应，限制继续生效';}
  if(action.type==='dismiss-feedback'){if(issue.kind!=='false-positive'||issue.status!=='acknowledged')throw new Error('请先响应并调查反馈。');issue.status='resolved';label='模拟调查完成；未变更生产防护和准入';}
  if(action.type==='replace'){
   if(issue.kind==='false-positive'||!['acknowledged','remediating'].includes(issue.status))throw new Error('请先响应整改项。');
   issue.status='validating';issue.replacementReady=true;issue.validationPassed=false;
   if(issue.bindingId){const b=record.bindings.find(b=>b.id===issue.bindingId);if(b){const profileVersion=`${Number.parseInt(b.profileVersion,10)+1}.0`;for(const sibling of record.bindings.filter(x=>x.profileId===b.profileId))sibling.profileVersion=profileVersion;b.status='pending';b.policyVersion=`${Number.parseInt(b.policyVersion,10)+1}.0`;b.guardrailVersion=`${Number.parseInt(b.guardrailVersion,10)+1}.0`;}}
   label='替换防护已准备（模拟），等待复测；限制继续生效';
  }
  if(action.type==='retest'){if(issue.status!=='validating'||!issue.replacementReady)throw new Error('请先准备修复。');issue.validationPassed=true;issue.status='awaiting-approval';label='模拟复测通过，等待适用审批及部署验证';}
  if(action.type==='approve-recovery'){
   if(issue.status!=='awaiting-approval'||!issue.validationPassed||!issue.replacementReady)throw new Error('复测及修复证据未齐备，不能恢复。');
   if(issue.bindingId){const b=record.bindings.find(b=>b.id===issue.bindingId);if(b)b.status='active';}
   issue.status='resolved';
   const others=gov.issues.filter(i=>i.agentId===issue.agentId&&i.releaseId===issue.releaseId&&i.status!=='resolved'&&i.kind!=='false-positive');
   if(!others.some(i=>i.kind==='critical')){record.assessment={...record.assessment,status:'passed',risk:others.length?'unknown':'low',reportId:`MEA-RECOVERY-${++gov.sequence}`,assessedAt:time,method:'模拟复测、签署及部署验证'};}
   label='模拟签署及部署验证完成，重新计算使用就绪状态';
  }
  issue.events.push({label,time});
 }
 return {...state,governance:gov};
}

export function assessCandidate(state:DemoState,agent:Agent,fail=false,time=seedTime):DemoState{
 const gov=structuredClone(ensureGovernance(state));const id=`candidate:${agent.id}:${agent.revision}`;
 const activeRelease=agent.versions.find(v=>v.version===agent.activeVersion)?.releaseId;
 const active=gov.records.find(r=>r.agentId===agent.id&&r.releaseId===activeRelease);
 const record=seedRecord(agent,id,agent.nextVersion,agent.revision);
 if(active)record.bindings=structuredClone(active.bindings);
 const protectionValid=record.bindings.every(b=>b.status==='active')&&!gov.issues.some(i=>i.agentId===agent.id&&i.kind==='critical'&&i.status!=='resolved');
 record.assessment={...record.assessment,status:fail||!protectionValid?'failed':'passed',risk:fail?'high':protectionValid?'low':'unknown',assessedAt:time,method:'当前草稿 Guardrail 验证 · 模拟结果'};
 gov.records=[record,...gov.records.filter(r=>r.releaseId!==id)];return {...state,governance:gov};
}
export function candidateAssessment(state:DemoState,agent:Agent){return ensureGovernance(state).records.find(r=>r.releaseId===`candidate:${agent.id}:${agent.revision}`)?.assessment??null;}
export function deployGovernance(state:DemoState,agent:Agent,releaseId:string):GovernanceState{
 const gov=structuredClone(ensureGovernance(state));const candidate=gov.records.find(r=>r.releaseId===`candidate:${agent.id}:${agent.revision}`);
 if(!candidate||candidate.assessment.status!=='passed')throw new Error('请先完成当前草稿的 Guardrail 验证。');
 gov.records.push({...structuredClone(candidate),releaseId});return gov;
}
