export type WorkStatus='active'|'waiting'|'review'|'completed';
export type MemberRole='owner'|'collaborator'|'observer';
export interface Person {id:string;name:string;department:string}
export const people:Person[]=[{id:'u-huang',name:'黄小明',department:'产品负责人'},{id:'u-lin',name:'林知夏',department:'财务'},{id:'u-chen',name:'陈一舟',department:'业务运营'},{id:'u-zhou',name:'周予安',department:'项目办公室'}];
export interface WorkMember {personId:string;role:MemberRole;history:'all'|'from_join';joinedSeq:number}
export interface WorkAgent {agentId:string;name:string;role:'coordinator'|'expert';version:string;releaseId:string;assignment:string}
export interface WorkConversation {id:string;title:string;kind:'main'|'topic';agentIds:string[];createdBy:string;createdAt:string;seq:number}
export interface WorkMessage {id:string;seq:number;sourceSeq?:number;conversationId?:string;sourceConversationId?:string;sourceMessageId?:string;goalRevision?:number;authorId:string;authorName:string;kind:'discussion'|'question'|'agent'|'system'|'assignment'|'decision';text:string;mentionId?:string;time:string}
export interface SubtaskInput {subtaskId:string;resultId:string;version:number;title?:string}
export interface SubtaskResult {id:string;version:number;content:string;createdAt:string;createdBy:string;goalRevision:number;seq:number;sourceSeq?:number;runId?:string;inputs:SubtaskInput[]}
export interface Subtask {id:string;title:string;assigneeId:string;status:'todo'|'running'|'done'|'blocked';goalRevision:number;conversationId?:string;sourceSeq?:number;runId?:string;runIds?:string[];createdBy:string;result?:string;seq:number;dependsOn?:string[];resultVersions?:SubtaskResult[];inputs?:SubtaskInput[]}
export interface ArtifactVersion {id:string;number:number;title:string;content:string;goalRevision:number;status:'draft'|'review'|'accepted'|'outdated';createdBy:string;createdAt:string;seq:number;sourceSeq?:number;acceptedBy?:string;acceptedAt?:string}
export interface WorkDecision {id:string;kind:'goal'|'scope'|'business';title:string;detail:string;proposedBy:string;status:'pending'|'approved'|'rejected';goalRevision:number;newGoal?:string;rebindAgents?:boolean;approverId:string;runId?:string;seq:number;resolvedBy?:string;resolvedAt?:string}
export interface WorkMaterial {id:string;name:string;source:'upload'|'knowledge';scope:'task';ownerId:string;seq:number;detail:string}
export interface Work {id:string;title:string;goal:string;goalRevision:number;scopeNotes?:string[];status:WorkStatus;ownerId:string;members:WorkMember[];agents:WorkAgent[];teamId?:string;teamVersion?:string;deliverableTitle:string;conversations:WorkConversation[];messages:WorkMessage[];subtasks:Subtask[];artifacts:ArtifactVersion[];decisions:WorkDecision[];materials:WorkMaterial[];createdAt:string;updatedAt:string;sessionId:string}
export interface WorkState {schema:2;works:Work[];actorId:string}
export interface Team {id:string;name:string;description:string;version:string;coordinatorId:string;agentIds:string[];category:string}
export const teams:Team[]=[{id:'TEAM-001',name:'经营汇报团队',description:'资料梳理、经营分析与报告撰写。',version:'v1.0.0',coordinatorId:'AGT-002',agentIds:['AGT-002','AGT-007','AGT-008'],category:'内容协作'},{id:'TEAM-002',name:'采购评审团队',description:'采购需求、制度核对与合同初审。',version:'v1.0.0',coordinatorId:'AGT-001',agentIds:['AGT-001','AGT-002','AGT-003'],category:'业务协作'}];
export interface NewWorkInput {title:string;goal:string;deliverableTitle:string;executorType:'agent'|'team';executorId:string;invitees?:string[]}
export const workStatusLabels:Record<WorkStatus,string>={active:'进行中',waiting:'待决策',review:'待验收',completed:'已完成'};
export const roleLabels:Record<MemberRole,string>={owner:'负责人',collaborator:'协作者',observer:'观察者'};
export const subtaskLabels:Record<Subtask['status'],string>={todo:'待开始',running:'执行中',done:'已完成',blocked:'需更新'};
export const authorName=(id:string)=>people.find(p=>p.id===id)?.name||id;
export const canWrite=(w:Work,actorId:string)=>w.members.some(m=>m.personId===actorId&&m.role!=='observer');
export const visibleAfter=(w:Work,actorId:string,seq:number)=>{const m=w.members.find(m=>m.personId===actorId);return !!m&&(m.history==='all'||seq>=m.joinedSeq);};
export const canSeeWorkItem=(w:Work,actorId:string,item:{seq:number;sourceSeq?:number})=>visibleAfter(w,actorId,item.seq)&&(item.sourceSeq===undefined||visibleAfter(w,actorId,item.sourceSeq));
export function getWorkConversations(w:Work):WorkConversation[]{return w.conversations?.length?w.conversations:[{id:`${w.id}-main`,title:'总协作',kind:'main',agentIds:w.agents.map(a=>a.agentId),createdBy:w.ownerId,createdAt:w.createdAt,seq:0}];}
export const mainConversationId=(w:Work)=>getWorkConversations(w).find(c=>c.kind==='main')!.id;
export function getTaskResults(t:Subtask):SubtaskResult[]{return t.resultVersions?.length?t.resultVersions:t.status==='done'&&t.result?[{id:`RESULT-${t.id}-v1`,version:1,content:t.result,createdAt:'',createdBy:t.assigneeId,goalRevision:t.goalRevision,seq:t.seq,sourceSeq:t.sourceSeq,runId:t.runId,inputs:t.inputs||[]}]:[];}
export const latestTaskResult=(t:Subtask)=>getTaskResults(t).at(-1);
export function taskReadiness(w:Work,t:Subtask,seen=new Set<string>()):'ready'|'waiting'|'outdated'{
 if(seen.has(t.id)||t.goalRevision!==w.goalRevision)return t.status==='done'?'outdated':'waiting';
 const next=new Set(seen).add(t.id);const ids=t.dependsOn||[];const deps=ids.map(id=>w.subtasks.find(x=>x.id===id));
 if(deps.some(d=>!d||d.status!=='done'||d.goalRevision!==w.goalRevision||taskReadiness(w,d,next)!=='ready'||!latestTaskResult(d)))return t.status==='done'?'outdated':'waiting';
 const result=latestTaskResult(t);
 if(t.status==='done'&&result){const used=result.inputs||[];if(used.length!==ids.length||deps.some(d=>{const r=latestTaskResult(d!)!;return !used.some(i=>i.subtaskId===d!.id&&i.resultId===r.id&&i.version===r.version);}))return 'outdated';}
 return 'ready';
}
export function dependencyInputs(w:Work,t:Subtask):SubtaskInput[]{return (t.dependsOn||[]).flatMap(id=>{const d=w.subtasks.find(x=>x.id===id);const r=d&&latestTaskResult(d);return r?[{subtaskId:id,resultId:r.id,version:r.version,title:d!.title}]:[];});}
export function dependenciesReady(w:Work,t:Subtask){return (t.dependsOn||[]).every(id=>{const d=w.subtasks.find(x=>x.id===id);return !!d&&d.status==='done'&&d.goalRevision===w.goalRevision&&taskReadiness(w,d)==='ready'&&!!latestTaskResult(d);});}
export function migrateWorkConversations(w:Work):Work {const conversations=getWorkConversations(w);const main=conversations.find(c=>c.kind==='main')!.id;return {...w,conversations,messages:w.messages.map(m=>({...m,conversationId:m.conversationId||main})),subtasks:w.subtasks.map(t=>({...t,conversationId:t.conversationId||main,...(getTaskResults(t).length?{resultVersions:getTaskResults(t)}:{})}))};}
function contextBase(w:Work,actorId:string,conversationId:string,resultTasks:Subtask[]){
 const conversation=getWorkConversations(w).find(c=>c.id===conversationId);
 if(!conversation||!w.members.some(m=>m.personId===actorId))return null;
 const messages=w.messages.filter(m=>(m.conversationId||mainConversationId(w))===conversationId&&canSeeWorkItem(w,actorId,m));
 const materials=w.materials.filter(m=>canSeeWorkItem(w,actorId,m));
 const decisions=w.decisions.filter(d=>d.status==='approved'&&canSeeWorkItem(w,actorId,d));
 const results=resultTasks.flatMap(t=>{const r=latestTaskResult(t);return r&&canSeeWorkItem(w,actorId,t)&&canSeeWorkItem(w,actorId,r)?[{task:t,result:r}]:[];});
 const sources=[...messages,...materials,...decisions,...results.map(x=>x.result)];
 return {sourceSeq:Math.min(...sources.map(x=>Math.min(x.seq,'sourceSeq' in x?x.sourceSeq??x.seq:x.seq)),Number.MAX_SAFE_INTEGER),input:`任务：${w.title}\n目标 r${w.goalRevision}：${w.goal}\n主交付物：${w.deliverableTitle}\n会话：${conversation.title}\n\n共享资料\n${materials.map(m=>`${m.name}：${m.detail}`).join('\n')||'无'}\n\n已确认决策\n${decisions.map(d=>d.detail).join('\n')||'无'}\n\n子任务成果（提交成果，不等同已确认事实）\n${results.map(({task:t,result:r})=>`${t.title} · v${r.version} · ${taskReadiness(w,t)==='outdated'?'输入已更新，需重新执行':'已提交'}\n${r.content}`).join('\n\n')||'无'}\n\n本会话讨论（不构成执行授权）\n${messages.map(m=>`${m.authorName} [目标 ${m.goalRevision===undefined?'历史未记录':`r${m.goalRevision}`}]：${m.text}`).join('\n')||'无'}`};
}
export function conversationContext(w:Work,actorId:string,conversationId:string){
 return contextBase(w,actorId,conversationId,w.subtasks.filter(t=>t.goalRevision===w.goalRevision&&t.status==='done'));
}
export function taskContext(w:Work,actorId:string,taskId:string){const t=w.subtasks.find(x=>x.id===taskId);if(!t||!canSeeWorkItem(w,actorId,t)||!dependenciesReady(w,t))return null;const deps=(t.dependsOn||[]).map(id=>w.subtasks.find(x=>x.id===id));if(deps.some(d=>!d||!canSeeWorkItem(w,actorId,d)||!latestTaskResult(d)||!canSeeWorkItem(w,actorId,latestTaskResult(d)!)))return null;const base=contextBase(w,actorId,t.conversationId||mainConversationId(w),deps as Subtask[]);return base?{...base,inputs:dependencyInputs(w,t)}:null;}
export function canSeeWorkRun(works:Work[],actorId:string,run:{id:string;workId?:string;sourceSeq?:number}){const linked=(t:Subtask)=>t.runId===run.id||t.runIds?.includes(run.id);const work=works.find(w=>w.id===run.workId||w.subtasks.some(linked)||w.decisions.some(d=>d.runId===run.id));if(!work)return !run.workId;const source=work.subtasks.find(linked)||work.decisions.find(d=>d.runId===run.id);return !!source&&canSeeWorkItem(work,actorId,{seq:source.seq,sourceSeq:run.sourceSeq??('sourceSeq' in source?source.sourceSeq:undefined)});}
