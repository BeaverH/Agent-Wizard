import type {Agent} from './model';
import {makeWork,appendMessage,recalculate,nextSeq} from './work-engine';
import {teams,type WorkState,type WorkAgent} from './work-model';
export function snapshotAgents(agents:Agent[],ids:string[],coordinatorId:string):WorkAgent[]{return ids.flatMap(id=>{const a=agents.find(a=>a.id===id);if(!a)return [];return [{agentId:id,name:a.name,role:id===coordinatorId?'coordinator' as const:'expert' as const,version:a.activeVersion||'未知',releaseId:a.versions.find(v=>v.version===a.activeVersion)?.releaseId||'未知',assignment:id===coordinatorId?'协调与口径确认':a.description}];});}
export function initialWorkState(agents:Agent[]):WorkState {
 const team=teams[0];
 const w=makeWork({title:'Q4 经营汇报',goal:'共同完成一份面向经营例会的 Q4 经营汇报，覆盖经营变化、渠道分析与下一步行动。',deliverableTitle:'Q4 经营汇报.md',executorType:'team',executorId:team.id,invitees:['u-lin','u-chen']},'u-huang',snapshotAgents(agents,team.agentIds,team.coordinatorId),team.version);
 w.id='WORK-1001';w.sessionId='SES-WORK-1001';
 w.materials.push({id:'MAT-1001',name:'Q4 经营数据样例',detail:'用于界面演示的经营汇总；重点核对收入、毛利与渠道口径。',source:'knowledge',scope:'task',ownerId:'u-huang',seq:nextSeq(w)});
 appendMessage(w,'u-lin','林知夏','discussion','我来确认财务口径。营收与回款需要分别呈现，避免把两个指标混在一起。');
 appendMessage(w,'AGT-007','经营分析专家','agent','已按经营变化、渠道结构和待确认事项整理分析框架。数据结论会保留来源。');
 w.subtasks[0].status='done';w.subtasks[0].result='资料已分类，财务与渠道口径分别列出，主交付物采用任务内共享资料。';
 w.subtasks[1].status='done';w.subtasks[1].result='经营分析框架已完成：经营变化、渠道结构、风险与行动建议。待确认数据不作为最终结论。';
 w.subtasks.push({id:'SUB-FINANCE',title:'确认财务统计口径',assigneeId:'u-lin',status:'done',goalRevision:1,createdBy:'u-huang',result:'营收与回款分开披露，渠道指标使用同一统计区间。',seq:nextSeq(w)});
 w.artifacts.push({id:'ART-1001',number:1,title:w.deliverableTitle,content:'# Q4 经营汇报\n\n## 经营概览\n经营变化、渠道结构和风险按统一统计口径呈现。\n\n## 待完善\n补充各渠道的变化与行动建议，核对财务口径。',goalRevision:1,status:'draft',createdBy:'u-huang',createdAt:w.createdAt,seq:nextSeq(w)});
 appendMessage(w,'u-chen','陈一舟','question','建议把渠道对比放到独立章节，方便经营会上直接讨论。','AGT-008');
 w.decisions.push({id:'DEC-1001',kind:'goal',title:'增加渠道对比章节',detail:'将渠道对比列为独立章节，并明确各渠道下一步行动。',proposedBy:'u-chen',status:'pending',goalRevision:1,newGoal:w.goal+' 增加独立的渠道对比章节，明确各渠道下一步行动。',approverId:'u-huang',seq:nextSeq(w)});
 appendMessage(w,'u-chen','陈一舟','decision','已提出目标变更，等待负责人确认。');
 recalculate(w);
 const purchase=makeWork({title:'办公设备采购方案',goal:'整理 3 台办公笔记本电脑的采购需求与审批路径，预算 24,000 元。',deliverableTitle:'办公设备采购方案.md',executorType:'agent',executorId:'AGT-001'},'u-huang',snapshotAgents(agents,['AGT-001'],'AGT-001'));
 purchase.id='WORK-1002';purchase.sessionId='SES-WORK-1002';purchase.subtasks[0].status='done';purchase.subtasks[0].runId='RUN-1028';purchase.subtasks[0].result='已整理需求、预算归属、审批路径与必要材料。';
 purchase.artifacts.push({id:'ART-1002',number:1,title:purchase.deliverableTitle,content:'# 办公设备采购方案\n\n需求：3 台办公笔记本电脑，预算合计 ¥24,000。\n\n审批路径：部门负责人 → 预算负责人 → 采购部门。\n\n所需材料：采购用途说明、设备配置清单、预算归属。\n\n引用：采购管理制度第 3.2 节。仅整理采购方案。',goalRevision:1,status:'accepted',createdBy:'u-huang',createdAt:purchase.createdAt,acceptedBy:'u-huang',acceptedAt:purchase.createdAt,seq:nextSeq(purchase)});
 appendMessage(purchase,'u-huang','黄小明','decision','验收主交付物 v1，协作任务完成。');recalculate(purchase);
 return {schema:2,works:[w,purchase],actorId:'u-huang'};
}
