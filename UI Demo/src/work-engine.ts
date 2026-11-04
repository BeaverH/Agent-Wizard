import {type Work,type WorkAgent,type WorkMessage,type WorkDecision,type NewWorkInput,type MemberRole,type Subtask,type SubtaskInput,people,authorName,canWrite,canSeeWorkItem,getWorkConversations,mainConversationId,migrateWorkConversations,getTaskResults,latestTaskResult,taskReadiness,dependencyInputs,dependenciesReady,taskContext} from './work-model.ts';

const stamp=()=>new Date().toLocaleString('zh-CN',{hour12:false});
const id=(prefix:string)=>`${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
export const nextSeq=(w:Work)=>Math.max(0,...(w.conversations||[]).map(x=>x.seq),...w.messages.map(x=>x.seq),...w.subtasks.map(x=>x.seq),...w.subtasks.flatMap(t=>getTaskResults(t).map(r=>r.seq)),...w.artifacts.map(x=>x.seq),...w.decisions.map(x=>x.seq),...w.materials.map(x=>x.seq))+1;
export function appendMessage(w:Work,authorId:string,authorNameValue:string,kind:WorkMessage['kind'],text:string,mentionId?:string,conversationId=mainConversationId(w)){w.messages.push({id:id('MSG'),seq:nextSeq(w),conversationId,goalRevision:w.goalRevision,authorId,authorName:authorNameValue,kind,text,mentionId,time:stamp()});w.updatedAt=stamp();}
export function recalculate(w:Work){const latest=w.artifacts.filter(a=>a.goalRevision===w.goalRevision).sort((a,b)=>b.number-a.number)[0];w.status=w.decisions.some(d=>d.status==='pending')?'waiting':latest?.status==='accepted'?'completed':latest?.status==='review'?'review':'active';w.updatedAt=stamp();return w;}
export function invalidateReview(w:Work){w.artifacts.filter(a=>a.goalRevision===w.goalRevision&&a.status==='review').forEach(a=>{a.status='outdated';});}
const owner=(w:Work,actor:string)=>w.ownerId===actor&&w.members.some(m=>m.personId===actor);
const writable=(w:Work,actor:string)=>canWrite(w,actor);
function dependencyError(w:Work,actor:string,targetId:string,ids:string[]){
 if(ids.some(id=>id===targetId))return '子任务不能依赖自身。';
 if(ids.some(id=>{const d=w.subtasks.find(t=>t.id===id);return !d||d.goalRevision!==w.goalRevision||!canSeeWorkItem(w,actor,d);}))return '依赖必须是当前目标下可见的子任务。';
 const reaches=(id:string,seen=new Set<string>()):boolean=>{if(id===targetId)return true;if(seen.has(id))return false;seen.add(id);return (w.subtasks.find(t=>t.id===id)?.dependsOn||[]).some(d=>reaches(d,seen));};
 return ids.some(id=>reaches(id))?'依赖会形成循环，请重新选择。':undefined;
}
export function recordSubtaskResult(w:Work,t:Subtask,content:string,createdBy:string,runId?:string,inputs:SubtaskInput[]=dependencyInputs(w,t)){
 const versions=getTaskResults(t);const sources=inputs.flatMap(i=>getTaskResults(w.subtasks.find(d=>d.id===i.subtaskId)!).filter(r=>r.id===i.resultId).map(r=>r.sourceSeq??r.seq));
 t.resultVersions=[...versions,{id:id('RESULT'),version:Math.max(0,...versions.map(r=>r.version))+1,content,createdAt:stamp(),createdBy,goalRevision:t.goalRevision,seq:nextSeq(w),sourceSeq:Math.min(t.seq,t.sourceSeq??t.seq,...sources),runId,inputs:structuredClone(inputs)}];
 t.result=content;t.status='done';t.inputs=structuredClone(inputs);invalidateReview(w);
}
export type WorkCommand=(
 |{type:'message';text:string;mentionId?:string}
 |{type:'create-conversation';id:string;title:string;agentIds:string[]}
 |{type:'publish-conclusion';text:string;sourceMessageId:string}
 |{type:'reference-message';sourceMessageId:string}
 |{type:'invite';personId:string;role:MemberRole;history:'all'|'from_join'}
 |{type:'remove';personId:string}
 |{type:'assign';title:string;assigneeId:string;dependsOn?:string[]}
 |{type:'set-dependencies';subtaskId:string;dependsOn:string[]}
 |{type:'save-result';subtaskId:string;content:string}
 |{type:'start';subtaskId:string;runId:string;sourceSeq?:number;inputs?:SubtaskInput[]}
 |{type:'human-result';subtaskId:string;result:string}
 |{type:'propose';kind:'goal'|'scope';detail:string;newGoal?:string;rebindAgents?:boolean}
 |{type:'business';detail:string}
 |{type:'resolve';decisionId:string;approve:boolean;runId?:string;agentSnapshots?:WorkAgent[]}
 |{type:'material';name:string;detail:string;source:'upload'|'knowledge';restricted?:boolean}
 |{type:'assemble'}
 |{type:'artifact';content:string;title?:string}
 |{type:'accept';artifactId:string})&{conversationId?:string};
export interface WorkResult {work?:Work;error?:string}
export function applyWorkCommand(original:Work,actor:string,c:WorkCommand):WorkResult {
 if(!original.members.some(m=>m.personId===actor))return {error:'你已不在此任务中。'};
 const w=migrateWorkConversations(structuredClone(original));
 if(['invite','remove','resolve','accept'].includes(c.type)&&!owner(w,actor))return {error:'仅任务负责人可以执行此操作。'};
 if(!writable(w,actor))return {error:'观察者仅可查看任务。'};
 const latest=w.artifacts.filter(a=>a.goalRevision===w.goalRevision).sort((a,b)=>b.number-a.number)[0];
 if(latest?.status==='accepted'&&!['message','create-conversation','publish-conclusion','reference-message','propose','invite','remove','resolve'].includes(c.type))return {error:'任务已验收；如需继续工作，请先提出目标变更。'};
 const conversationId=c.conversationId||mainConversationId(w);
 const conversation=getWorkConversations(w).find(x=>x.id===conversationId);
 if(!conversation)return {error:'会话不存在。'};
 const actorName=authorName(actor);
 switch(c.type){
  case 'create-conversation': {
   if(!c.title.trim()||c.title.trim().length>48)return {error:'请填写 1 至 48 字的会话名称。'};
   if(w.conversations.some(x=>x.id===c.id||x.title===c.title.trim()))return {error:'会话已存在，请使用其他名称。'};
   if(!c.agentIds.length||c.agentIds.some(a=>!w.agents.some(x=>x.agentId===a)))return {error:'请选择任务内的 Agent。'};
   w.conversations.push({id:c.id,title:c.title.trim(),kind:'topic',agentIds:[...new Set(c.agentIds)],createdBy:actor,createdAt:stamp(),seq:nextSeq(w)});
   appendMessage(w,actor,actorName,'system',`创建专题会话「${c.title.trim()}」。`);break;
  }
  case 'publish-conclusion':
  case 'reference-message': {
   const source=w.messages.find(m=>m.id===c.sourceMessageId);
   if(!source||!canSeeWorkItem(w,actor,source))return {error:'来源消息不可见，不能引用或提交。'};
   const sourceConversation=source.conversationId||mainConversationId(w);
   if(c.type==='publish-conclusion'&&(conversation.kind!=='topic'||sourceConversation!==conversationId))return {error:'请从专题会话中选择来源消息。'};
   const target=c.type==='publish-conclusion'?mainConversationId(w):conversationId;
   if(sourceConversation===target)return {error:'请选择另一个会话作为引用目标。'};
   const text=c.type==='publish-conclusion'?c.text.trim():source.text;
   if(!text)return {error:'请填写要提交的结论。'};
   if(w.messages.some(m=>m.conversationId===target&&m.sourceMessageId===source.id&&m.text===text))return {error:'此内容已提交到目标会话。'};
   appendMessage(w,actor,actorName,'discussion',text,undefined,target);
   Object.assign(w.messages[w.messages.length-1],{sourceConversationId:sourceConversation,sourceMessageId:source.id,sourceSeq:Math.min(source.seq,source.sourceSeq??source.seq),goalRevision:source.goalRevision??w.goalRevision});
   break;
  }
  case 'message': {
   if(!c.text.trim())return {error:'请输入消息。'};
   if(c.mentionId&&!conversation.agentIds.includes(c.mentionId)&&!w.members.some(m=>m.personId===c.mentionId))return {error:'被提及的成员未参与此会话。'};
   appendMessage(w,actor,actorName,c.mentionId?'question':'discussion',c.text.trim(),c.mentionId,conversationId);
   const expert=w.agents.find(a=>a.agentId===c.mentionId);
   if(expert)appendMessage(w,expert.agentId,expert.name,'agent',`收到。此问题将作为当前目标 r${w.goalRevision} 的讨论信息；如需执行，请派发子任务。`,undefined,conversationId);
   break;
  }
  case 'invite': {
   if(!people.some(p=>p.id===c.personId))return {error:'请选择可邀请的成员。'};
   if(c.role==='owner')return {error:'任务仅有一位负责人。'};
   if(w.members.some(m=>m.personId===c.personId))return {error:'该成员已在任务中。'};
   w.members.push({personId:c.personId,role:c.role,history:c.history,joinedSeq:nextSeq(w)});
   appendMessage(w,actor,actorName,'system',`邀请 ${authorName(c.personId)} 加入任务，历史范围：${c.history==='all'?'全部任务历史':'加入后的内容'}。`);break;
  }
  case 'remove': {
   if(c.personId===w.ownerId)return {error:'不能移除任务负责人。'};
   if(!w.members.some(m=>m.personId===c.personId))return {error:'成员已不在任务中。'};
   w.members=w.members.filter(m=>m.personId!==c.personId);
   w.subtasks.forEach(t=>{if(t.assigneeId===c.personId&&t.status!=='done')t.status='blocked';});
   appendMessage(w,actor,actorName,'system',`${authorName(c.personId)} 已移出任务，其未完成的子任务需要重新分派。`);break;
  }
  case 'assign': {
   if(!c.title.trim())return {error:'请填写子任务目标。'};
   const person=w.members.find(m=>m.personId===c.assigneeId);
   if((!person&&!conversation.agentIds.includes(c.assigneeId))||person?.role==='observer')return {error:'执行者未参与此会话，或仅有观察权限。'};
   const error=dependencyError(w,actor,'NEW',c.dependsOn||[]);if(error)return {error};
   w.subtasks.push({id:id('SUB'),title:c.title.trim(),assigneeId:c.assigneeId,status:'todo',goalRevision:w.goalRevision,conversationId,createdBy:actor,seq:nextSeq(w),dependsOn:[...new Set(c.dependsOn||[])]});
   invalidateReview(w);
   appendMessage(w,actor,actorName,'assignment',`派发子任务：${c.title.trim()}`,c.assigneeId,conversationId);break;
  }
  case 'set-dependencies': {
   const t=w.subtasks.find(t=>t.id===c.subtaskId);
   if(!t||t.goalRevision!==w.goalRevision||!canSeeWorkItem(w,actor,t)||t.status==='running')return {error:'当前子任务不能修改依赖。'};
   const error=dependencyError(w,actor,t.id,c.dependsOn);if(error)return {error};
   t.dependsOn=[...new Set(c.dependsOn)];invalidateReview(w);
   appendMessage(w,actor,actorName,'system',`更新「${t.title}」的依赖，后续执行将读取依赖成果。`,undefined,t.conversationId);break;
  }
  case 'start': {
   const t=w.subtasks.find(t=>t.id===c.subtaskId);
   if(!t||t.goalRevision!==w.goalRevision||!canSeeWorkItem(w,actor,t)||!(t.status==='todo'||t.status==='blocked'||t.status==='done'&&taskReadiness(w,t)==='outdated'))return {error:'子任务已启动、已完成或不属于当前目标。'};
   if(!dependenciesReady(w,t))return {error:'请先完成并更新上游子任务成果。'};
   if((t.dependsOn||[]).some(id=>{const d=w.subtasks.find(x=>x.id===id)!;const r=latestTaskResult(d);return !canSeeWorkItem(w,actor,d)||!r||!canSeeWorkItem(w,actor,r);}))return {error:'你无权读取执行所需的依赖成果。'};
   if(!w.agents.some(a=>a.agentId===t.assigneeId))return {error:'此子任务由真人提交结果。'};
   const retry=t.status==='blocked'||t.status==='done';
   const protectedAction=w.decisions.some(d=>d.kind==='business'&&d.status==='approved'&&d.runId&&(d.runId===t.runId||t.runIds?.includes(d.runId)));
   if(retry&&protectedAction&&!owner(w,actor))return {error:'业务动作重试需要负责人再次确认。'};
   t.runIds=[...new Set([...(t.runIds||[]),...(t.runId?[t.runId]:[]),c.runId])];
   const inputs=dependencyInputs(w,t);
   if(c.inputs&&JSON.stringify(c.inputs)!==JSON.stringify(inputs))return {error:'依赖成果已更新，请刷新本次执行依据。'};
   t.status='running';t.runId=c.runId;t.result=undefined;t.inputs=structuredClone(inputs);t.sourceSeq=Math.min(t.seq,c.sourceSeq??t.seq,...inputs.map(i=>{const d=w.subtasks.find(x=>x.id===i.subtaskId)!;return latestTaskResult(d)!.sourceSeq??latestTaskResult(d)!.seq;}));invalidateReview(w);
   appendMessage(w,actor,actorName,'system',`${retry?(protectedAction?'负责人确认重试':'重试'):'启动'}「${t.title}」，执行记录 ${c.runId}。`,undefined,t.conversationId);break;
  }
  case 'human-result':
  case 'save-result': {
   const t=w.subtasks.find(t=>t.id===c.subtaskId);
   if(!t||t.goalRevision!==w.goalRevision||!canSeeWorkItem(w,actor,t)||t.status==='running'||c.type==='human-result'&&(!w.members.some(m=>m.personId===t.assigneeId)||t.status==='done'))return {error:'此子任务无法提交结果。'};
   if(actor!==t.assigneeId&&!owner(w,actor))return {error:'仅执行者或负责人可以提交此子任务结果。'};
   if(w.decisions.some(d=>d.kind==='business'&&d.runId&&(d.runId===t.runId||t.runIds?.includes(d.runId))))return {error:'业务动作成果由执行记录生成，请通过负责人确认的再次执行更新。'};
   if(!dependenciesReady(w,t))return {error:'上游成果尚未就绪，暂不能提交。'};
   if(!taskContext(w,actor,t.id))return {error:'你无权读取此任务所需的依赖成果。'};
   const content=(c.type==='human-result'?c.result:c.content).trim();if(!content)return {error:'请填写子任务成果。'};
   recordSubtaskResult(w,t,content,actor);
   appendMessage(w,actor,actorName,'discussion',`提交「${t.title}」成果 v${latestTaskResult(t)!.version}\n${content}`,undefined,t.conversationId);w.messages[w.messages.length-1].sourceSeq=latestTaskResult(t)!.sourceSeq;break;
  }
  case 'propose': {
   if(!c.detail.trim()||(c.kind==='goal'&&!c.newGoal?.trim()))return {error:'请填写变更内容与原因。'};
   w.decisions.push({id:id('DEC'),kind:c.kind,title:c.kind==='goal'?'目标变更':'执行范围变更',detail:c.detail.trim(),newGoal:c.kind==='goal'?c.newGoal?.trim():undefined,rebindAgents:c.kind==='scope'&&c.rebindAgents,proposedBy:actor,status:'pending',goalRevision:w.goalRevision,approverId:w.ownerId,seq:nextSeq(w)});
   appendMessage(w,actor,actorName,'decision',`提出${c.kind==='goal'?'目标':'执行范围'}变更：${c.detail.trim()}`);break;
  }
  case 'business': {
   if(!c.detail.trim())return {error:'请说明需要执行的业务动作。'};
   w.decisions.push({id:id('DEC'),kind:'business',title:'业务执行确认',detail:c.detail.trim(),proposedBy:actor,status:'pending',goalRevision:w.goalRevision,approverId:w.ownerId,seq:nextSeq(w)});
   appendMessage(w,actor,actorName,'decision',`请求业务执行确认：${c.detail.trim()}`);break;
  }
  case 'resolve': {
   const d=w.decisions.find(d=>d.id===c.decisionId);
   if(!d||d.status!=='pending')return {error:'该决策已处理，不会重复执行。'};
   if(d.approverId!==actor)return {error:'你不是此决策的确认人。'};
   if(c.approve&&d.goalRevision!==w.goalRevision)return {error:'该申请针对旧目标，请驳回后重新提交。'};
   if(c.approve&&d.kind==='business'&&!c.runId)return {error:'业务动作未取得有效执行入口。'};
   if(c.approve&&d.kind==='scope'&&d.rebindAgents&&!c.agentSnapshots?.length)return {error:'执行者当前版本尚未通过授权与可用性校验。'};
   d.status=c.approve?'approved':'rejected';d.resolvedBy=actor;d.resolvedAt=stamp();d.runId=c.runId;
   if(c.approve&&d.kind==='business'&&c.runId){
    const coordinator=w.agents.find(a=>a.role==='coordinator')||w.agents[0];
    w.subtasks.push({id:id('SUB'),title:d.detail,assigneeId:coordinator.agentId,status:'running',goalRevision:w.goalRevision,runId:c.runId,createdBy:actor,seq:nextSeq(w)});
    w.artifacts.filter(a=>a.goalRevision===w.goalRevision&&a.status==='review').forEach(a=>{a.status='draft';});
   }
   if(c.approve&&(d.kind==='goal'||d.kind==='scope')){
    w.goalRevision+=1;if(d.kind==='goal'&&d.newGoal)w.goal=d.newGoal;
    if(d.kind==='scope')w.scopeNotes=[...(w.scopeNotes||[]),d.detail];
    if(d.kind==='scope'&&d.rebindAgents&&c.agentSnapshots){w.agents=structuredClone(c.agentSnapshots);appendMessage(w,actor,actorName,'system',`重新绑定执行者版本：${w.agents.map(a=>`${a.name} ${a.version}`).join('、')}。`);}
    w.artifacts.forEach(a=>{a.status='outdated';});
    w.subtasks.forEach(t=>{if(t.goalRevision<w.goalRevision&&t.status!=='done')t.status='blocked';});
   }
   appendMessage(w,actor,actorName,'decision',`${c.approve?'批准':'驳回'}${d.title}。${c.approve&&d.kind!=='business'?`目标更新为 r${w.goalRevision}，旧成果保留，需按新目标重新执行。`:c.runId?`执行记录 ${c.runId}。`:''}`);break;
  }
  case 'material': {
   if(c.restricted)return {error:'此资料未获任务共享授权，不能加入群聊。'};
   if(!c.name.trim())return {error:'请填写资料名称。'};
   w.materials.push({id:id('MAT'),name:c.name.trim(),detail:c.detail.trim(),source:c.source,scope:'task',ownerId:actor,seq:nextSeq(w)});
   invalidateReview(w);
   appendMessage(w,actor,actorName,'system',`共享资料：${c.name.trim()}`);break;
  }
  case 'assemble':
  case 'artifact': {
   const current=w.subtasks.filter(t=>t.goalRevision===w.goalRevision);
   if(w.decisions.some(d=>d.status==='pending'))return {error:'请先处理待决策事项。'};
   if(c.type==='assemble'&&(!current.length||current.some(t=>t.status!=='done'||taskReadiness(w,t)!=='ready'||!latestTaskResult(t))))return {error:'请先完成当前目标的子任务，并更新受影响的下游成果。'};
   if(c.type==='assemble'&&[...current,...current.flatMap(t=>latestTaskResult(t)?[latestTaskResult(t)!]:[]),...w.materials].some(x=>!canSeeWorkItem(w,actor,x)))return {error:'当前历史范围不包含全部汇总资料，请由负责人生成成果。'};
   const content=c.type==='artifact'?c.content.trim():`# ${w.deliverableTitle}\n\n## 交付目标\n${w.goal}\n\n## 协作结果\n${current.map((t,i)=>`${i+1}. ${t.title} · v${latestTaskResult(t)?.version||1}\n${latestTaskResult(t)?.content||t.result}`).join('\n\n')}\n\n## 依据\n${w.materials.map(m=>`- ${m.name}：${m.detail}`).join('\n')||'任务内已确认的目标与子任务结果。'}`;
   if(!content)return {error:'成果内容不能为空。'};
   w.artifacts.filter(a=>a.status==='review').forEach(a=>a.status='draft');
   const provenance=c.type==='assemble'?[...current.map(x=>latestTaskResult(x)?.sourceSeq??x.sourceSeq??x.seq),...w.materials.map(x=>x.seq)]:w.artifacts.filter(a=>a.goalRevision===w.goalRevision).map(a=>a.sourceSeq??a.seq);
   w.artifacts.push({id:id('ART'),number:Math.max(0,...w.artifacts.map(a=>a.number))+1,title:c.type==='artifact'&&c.title?.trim()?c.title.trim():w.deliverableTitle,content,goalRevision:w.goalRevision,status:'review',createdBy:actor,createdAt:stamp(),seq:nextSeq(w),sourceSeq:provenance.length?Math.min(...provenance):undefined});
   appendMessage(w,actor,actorName,'system',`提交主交付物新版本，等待负责人验收。`);break;
  }
  case 'accept': {
   const a=w.artifacts.find(a=>a.id===c.artifactId);
   const latest=Math.max(0,...w.artifacts.filter(a=>a.goalRevision===w.goalRevision).map(a=>a.number));
   if(!a||a.goalRevision!==w.goalRevision||a.status!=='review'||a.number!==latest)return {error:'只能验收当前目标的最新待审成果。'};
   if(w.decisions.some(d=>d.status==='pending'))return {error:'还有未处理的决策，不能验收。'};
   const current=w.subtasks.filter(t=>t.goalRevision===w.goalRevision);
   if(!current.length||current.some(t=>t.status!=='done'||taskReadiness(w,t)!=='ready'||!latestTaskResult(t)))return {error:'当前目标的子任务未完成或下游成果需更新。'};
   a.status='accepted';a.acceptedBy=actor;a.acceptedAt=stamp();
   appendMessage(w,actor,actorName,'decision',`验收主交付物 v${a.number}，协作任务完成。`);break;
  }
 }
 return {work:recalculate(w)};
}

export function makeWork(input:NewWorkInput,actorId:string,agents:WorkAgent[],teamVersion?:string):Work {
 const w:Work={id:id('WORK'),title:input.title.trim(),goal:input.goal.trim(),goalRevision:1,status:'active',ownerId:actorId,members:[{personId:actorId,role:'owner',history:'all',joinedSeq:0},...(input.invitees||[]).filter((p,i,a)=>p!==actorId&&people.some(x=>x.id===p)&&a.indexOf(p)===i).map(personId=>({personId,role:'collaborator' as const,history:'all' as const,joinedSeq:0}))],agents:structuredClone(agents),teamId:input.executorType==='team'?input.executorId:undefined,teamVersion,deliverableTitle:input.deliverableTitle.trim(),conversations:[],messages:[],subtasks:[],artifacts:[],decisions:[],materials:[],createdAt:stamp(),updatedAt:stamp(),sessionId:id('SES')};
 w.conversations=getWorkConversations(w);
 appendMessage(w,actorId,authorName(actorId),'discussion',input.goal.trim());
 const coordinator=agents.find(a=>a.role==='coordinator')||agents[0];
 if(coordinator)appendMessage(w,coordinator.agentId,coordinator.name,'agent',`已建立任务。围绕「${input.deliverableTitle}」安排资料整理、执行与成果汇总。`);
 agents.forEach((a,i)=>{w.subtasks.push({id:id('SUB'),title:agents.length===1?`完成${input.deliverableTitle}`:i===0?'整理资料与确认口径':i===agents.length-1?'撰写与整合报告':'分析经营变化与风险',assigneeId:a.agentId,status:'todo',goalRevision:1,conversationId:mainConversationId(w),createdBy:actorId,seq:nextSeq(w)});});
 return w;
}
