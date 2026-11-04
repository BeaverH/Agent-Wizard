import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, ArrowUpRight, Check, CheckCircle2, ChevronRight, Clock3, FlaskConical, GitBranch, Link2, MessageSquareText, ShieldCheck, ShieldOff, Users } from 'lucide-react';
import { useDemo, type PageProps } from '@/store';
import { getAgentGovernance, getGovernanceIssues, governanceImpact, readinessLabels, riskLabels, type GovernanceIssue } from '@/governance';
import { teams } from '@/work-model';
import { useWorks } from '@/work-store';
import { AgentIcon, EmptyState, Field, InfoTip, Notice, PageHeader, SearchBox } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import '@/styles/management.css';
import '@/styles/governance.css';

const measureUrl='http://127.0.0.1:18082/v2/guardrails?role=approver#Profile/measure/';
const issueLabels:Record<GovernanceIssue['status'],string>={open:'待确认',acknowledged:'已接手',remediating:'整改中',validating:'待复测','awaiting-approval':'待恢复签署',resolved:'已解决'};
type Scenario='false-positive'|'revoke-required'|'revoke-action'|'critical'|'revoke-shared';
const scenarios:{value:Scenario;title:string;description:string}[]=[
 {value:'false-positive',title:'疑似误报反馈',description:'创建调查待办，保持当前使用范围。'},
 {value:'revoke-action',title:'撤销敏感动作防护',description:'保留一般任务，暂停需要人工确认的业务动作。'},
 {value:'revoke-required',title:'撤销必需防护',description:'暂停受影响生产版本的新执行及在途执行。'},
 {value:'critical',title:'确认严重漏报',description:'暂停受影响版本，进入整改与复测。'},
 {value:'revoke-shared',title:'撤销共享防护',description:'联动所有引用同一必需策略的生产版本。'},
];
function StateBadge({state}:{state:ReturnType<typeof getAgentGovernance>['readiness']}){return <span className={`gov-state ${state}`}>{readinessLabels[state]}</span>;}
function IssueStage({issue}:{issue:GovernanceIssue}){return <span className={`gov-stage ${issue.status}`}>{issueLabels[issue.status]}</span>;}
function Risk({risk}:{risk:ReturnType<typeof getAgentGovernance>['risk']}){return <span className={`gov-risk ${risk}`}>{riskLabels[risk]}</span>;}
function teamsFor(agentIds:string[]){return teams.filter(team=>team.agentIds.some(id=>agentIds.includes(id)));}
function Workflow({issue}:{issue:GovernanceIssue}){
 const stages=['确认接手','修复与替换','复测','签署恢复'];
 const at=issue.status==='open'?0:issue.status==='acknowledged'||issue.status==='remediating'?1:issue.status==='validating'?2:3;
 return <div className="gov-workflow" aria-label="整改进度">{stages.map((stage,index)=><span key={stage} className={issue.status==='resolved'||index<at?'done':index===at?'active':''}><i>{issue.status==='resolved'||index<at?<Check/>:index+1}</i>{stage}{index<stages.length-1&&<ChevronRight/>}</span>)}</div>;
}

export default function Governance({selectedId,onNavigate}:PageProps){
 const demo=useDemo();
 const {state,governanceAction}=demo;
 const works=useWorks();
 const issues=getGovernanceIssues(state);
 const [tab,setTab]=useState<'bindings'|'issues'>('bindings');
 const [query,setQuery]=useState('');
 const [readiness,setReadiness]=useState('all');
 const [issueFilter,setIssueFilter]=useState('open');
 const [agentId,setAgentId]=useState<string|null>(null);
 const [issueId,setIssueId]=useState<string|null>(null);
 const [eventOpen,setEventOpen]=useState(false);
 const [eventAgent,setEventAgent]=useState(state.agents.find(agent=>agent.activeVersion)?.id||'');
 const [scenario,setScenario]=useState<Scenario>('false-positive');
 const [nextIssueAgent,setNextIssueAgent]=useState<string|null>(null);
 const [error,setError]=useState('');
 useEffect(()=>{
  if(!selectedId)return;
  const selectedIssue=issues.find(issue=>issue.id===selectedId);
  if(selectedIssue){setTab('issues');setIssueId(selectedIssue.id);setAgentId(null);}
  else if(state.agents.some(agent=>agent.id===selectedId)){setAgentId(selectedId);setIssueId(null);}
 },[selectedId]);
 useEffect(()=>{if(!nextIssueAgent)return;const issue=issues.find(item=>item.agentId===nextIssueAgent&&item.status!=='resolved');if(issue){setIssueId(issue.id);setNextIssueAgent(null);}},[issues,nextIssueAgent]);
 const views=state.agents.map(agent=>({agent,view:getAgentGovernance(state,agent)}));
 const counts={ready:views.filter(item=>item.view.readiness==='ready').length,limited:views.filter(item=>item.view.readiness==='limited').length,'not-ready':views.filter(item=>item.view.readiness==='not-ready').length};
 const openIssues=issues.filter(issue=>issue.status!=='resolved');
 const visible=views.filter(({agent,view})=>(readiness==='all'||view.readiness===readiness)&&`${agent.name} ${agent.id} ${agent.owner} ${view.bindings.map(b=>`${b.profileId} ${b.guardrailName} ${b.policyName}`).join(' ')}`.toLowerCase().includes(query.toLowerCase()));
 const visibleIssues=issues.filter(issue=>(issueFilter==='all'||(issueFilter==='open'?issue.status!=='resolved':issue.status==='resolved'))&&`${issue.title} ${issue.agentId} ${issue.owner} ${state.agents.find(a=>a.id===issue.agentId)?.name||''}`.toLowerCase().includes(query.toLowerCase()));
 const selectedAgent=state.agents.find(agent=>agent.id===agentId);
 const selectedView=selectedAgent?getAgentGovernance(state,selectedAgent):null;
 const issue=issues.find(item=>item.id===issueId);
 const issueAgent=state.agents.find(agent=>agent.id===issue?.agentId);
 const issueView=issueAgent?getAgentGovernance(state,issueAgent):null;
 const eventTarget=state.agents.find(agent=>agent.id===eventAgent);
 const affectedAgents=governanceImpact(state,eventAgent,scenario==='revoke-shared');
 const affectedTeams=teamsFor(affectedAgents.map(agent=>agent.id));
 const affectedWorkCount=works.state.works.filter(work=>work.status!=='completed'&&work.agents.some(a=>affectedAgents.some(agent=>agent.id===a.agentId&&agent.activeVersion===a.version))).length;
 function closeAgent(){setAgentId(null);if(selectedId)onNavigate('management','policies');}
 function closeIssue(){setIssueId(null);setError('');if(selectedId)onNavigate('management','policies');}
 function act(type:'acknowledge'|'replace'|'retest'|'approve-recovery'|'dismiss-feedback'){
  if(!issue)return;
  setError('');
  if(!governanceAction({type,issueId:issue.id}))setError('当前条件尚未满足，请检查防护替换、复测和签署步骤。');
 }
 function simulate(){
  setError('');
  if(!eventTarget?.activeVersion){setError('请选择已部署版本。');return;}
  if(governanceAction({type:'simulate',agentId:eventAgent,scenario})){setEventOpen(false);setTab('issues');setQuery('');setIssueFilter('open');setNextIssueAgent(eventAgent);}
  else setError('该事件已有未解决待办，或当前版本不满足演示条件。');
 }
 return <div className="mg-page gov-page">
  <PageHeader title="安全与策略" description="治理状态独立于发布、部署与访问授权。当前数据为本地模拟，未连接 Guardrail 服务；风险等级来自演示评估。" actions={<><a className="gov-header-link" href={measureUrl} target="_blank" rel="noreferrer">Guardrail Measure<ArrowUpRight size={14}/></a><Button variant="outline" onClick={()=>{setError('');setEventOpen(true);}}><FlaskConical/>演示事件</Button></>}/>
  <div className="gov-toolbar"><div className="filter-pills" aria-label="治理视图"><button className={tab==='bindings'?'active':''} onClick={()=>{setTab('bindings');setQuery('');}}>防护绑定</button><button className={tab==='issues'?'active':''} onClick={()=>{setTab('issues');setQuery('');}}>整改待办<b>{openIssues.length}</b></button></div><SearchBox value={query} onChange={setQuery} placeholder={tab==='bindings'?'搜索 Agent、负责人或策略…':'搜索问题、Agent 或负责人…'}/></div>
  {tab==='bindings'?<section className="mg-panel mg-table-panel gov-table-panel" aria-label="Agent 防护绑定">
   <div className="gov-summary"><span><ShieldCheck size={15}/>Ready<strong>{counts.ready}</strong></span><span><ShieldOff size={15}/>Limited<strong>{counts.limited}</strong></span><span><AlertTriangle size={15}/>Not Ready<strong>{counts['not-ready']}</strong></span><span className="gov-summary-source"><FlaskConical/>本地演示</span></div>
   <div className="mg-list-summary"><span>Agent 防护与评估<InfoTip label="治理状态说明">Ready：必要防护与评估有效。Limited：仅一般任务可用。Not Ready：尚未满足执行条件。发布、部署和使用授权另行校验。</InfoTip></span><label className="mg-filter"><span>就绪状态</span><select aria-label="就绪状态" value={readiness} onChange={e=>setReadiness(e.target.value)}><option value="all">全部状态</option><option value="ready">Ready</option><option value="limited">Limited</option><option value="not-ready">Not Ready</option></select></label></div>
   <div className="mg-table-scroll"><table className="mg-table gov-table"><thead><tr><th>Agent / Owner</th><th>生产版本</th><th>治理就绪</th><th>剩余风险<InfoTip label="关于剩余风险">评估已考虑当前防护。拦截数量不直接决定风险等级；未评估不代表低风险。</InfoTip></th><th>有效 Profile</th><th className="mg-align-right">待办</th><th/></tr></thead><tbody>{visible.map(({agent,view})=><tr key={agent.id}><td><div className="mg-agent-cell"><AgentIcon icon={agent.icon}/><div><button className="mg-name-link" onClick={()=>setAgentId(agent.id)}>{agent.name}</button><small>{agent.id} · {agent.owner}</small></div></div></td><td><code>{view.version||'尚未部署'}</code></td><td><StateBadge state={view.readiness}/></td><td><Risk risk={view.risk}/></td><td><span className="gov-binding-name">{view.bindings[0]?.profileId||'—'}</span>{view.bindings[0]&&<small>v{view.bindings[0].profileVersion} · {view.bindings.filter(b=>b.status==='active').length}/{view.bindings.length} 策略生效</small>}</td><td className="mg-align-right">{view.issues.filter(i=>i.status!=='resolved').length>0?<button className="gov-issue-count" aria-label={`查看${agent.name}整改待办`} onClick={()=>{setTab('issues');setQuery(agent.id);}}>{view.issues.filter(i=>i.status!=='resolved').length}</button>:'—'}</td><td className="mg-align-right"><Button size="sm" variant="ghost" onClick={()=>setAgentId(agent.id)}>查看<ChevronRight/></Button></td></tr>)}</tbody></table></div>
   {visible.length===0&&<EmptyState/>}
  </section>:<section className="mg-panel mg-table-panel" aria-label="治理整改待办">
   <div className="mg-list-summary"><span>整改待办 <span className="mg-count">{visibleIssues.length}</span></span><label className="mg-filter"><span>处理状态</span><select aria-label="整改处理状态" value={issueFilter} onChange={e=>setIssueFilter(e.target.value)}><option value="open">未解决</option><option value="resolved">已解决</option><option value="all">全部</option></select></label></div>
   <div className="gov-issue-list">{visibleIssues.map(item=>{const agent=state.agents.find(a=>a.id===item.agentId);return <button className="gov-issue-row" key={item.id} onClick={()=>{setIssueId(item.id);setError('');}}><span className={`gov-issue-symbol ${item.status==='resolved'?'resolved':item.kind==='false-positive'?'feedback':''}`}>{item.status==='resolved'?<CheckCircle2 size={17}/>:item.kind==='false-positive'?<MessageSquareText size={17}/>:<ShieldOff size={17}/>}</span><span className="gov-issue-main"><strong>{item.title}</strong><small>{agent?.name||item.agentId} · {item.version} · {item.id}</small></span><span className="gov-issue-meta gov-issue-owner">{item.owner}<small>Owner</small></span><span className="gov-issue-meta"><IssueStage issue={item}/><small>{item.status==='resolved'?'已保留处理记录':`期限 ${item.dueAt}`}</small></span><ChevronRight size={15}/></button>;})}</div>
   {visibleIssues.length===0&&<EmptyState title={issueFilter==='open'?'暂无待处理问题':'暂无匹配记录'}/>}
  </section>}

  <Dialog open={!!selectedAgent} onOpenChange={open=>{if(!open)closeAgent();}}><DialogContent className="gov-modal" aria-describedby={undefined}><DialogHeader><DialogTitle>Agent 防护详情</DialogTitle></DialogHeader>{selectedAgent&&selectedView&&<div className="gov-modal-body">
   <div className="gov-agent-heading"><AgentIcon icon={selectedAgent.icon}/><div><h3>{selectedAgent.name}</h3><p>{selectedAgent.id} · {selectedAgent.owner}</p></div><StateBadge state={selectedView.readiness}/></div>
   <dl className="gov-definition"><div><dt>生产版本</dt><dd>{selectedView.version||'尚未部署'}</dd></div><div><dt>剩余风险</dt><dd><Risk risk={selectedView.risk}/></dd></div><div><dt>发布状态</dt><dd>{selectedAgent.status==='delivered'?'已交付':'当前修订独立管理'}</dd></div></dl>
   {selectedView.reason&&<Notice tone={selectedView.readiness==='ready'?'success':'warning'}>{selectedView.reason}</Notice>}
   {selectedView.bindings.length>0&&<section><div className="gov-section-heading"><Link2 size={15}/><h3>生效依赖</h3></div><div className="gov-chain"><div><small>Profile</small><strong>{selectedView.bindings[0].profileId}</strong><code>v{selectedView.bindings[0].profileVersion}</code></div><ArrowRight/><div><small>Guardrail</small><strong>{selectedView.bindings[0].guardrailName}</strong><code>v{selectedView.bindings[0].guardrailVersion}</code></div><ArrowRight/><div><small>Policy</small><strong>{selectedView.bindings[0].policyName}</strong><code>{selectedView.bindings[0].policyId} · v{selectedView.bindings[0].policyVersion}</code></div></div></section>}
   {selectedView.bindings.length>0&&<div className="gov-protection-list">{selectedView.bindings.map(binding=><div key={binding.id} className={`gov-protection-item ${binding.status}`}><ShieldCheck size={16}/><div><strong>{binding.policyName}</strong><small>{binding.policyId} · v{binding.policyVersion} · {binding.scope==='all'?'全部执行必需':'敏感业务动作'}</small></div><span>{binding.status==='active'?'生效':binding.status==='revoked'?'已撤销':'待生效'}</span></div>)}</div>}
   <section><div className="gov-section-heading"><FlaskConical size={15}/><h3>版本评估</h3></div>{selectedView.assessment?<dl className="gov-definition"><div><dt>报告</dt><dd><code>{selectedView.assessment.reportId}</code></dd></div><div><dt>评估结果</dt><dd>{selectedView.assessment.status==='passed'?'通过':selectedView.assessment.status==='failed'?'未通过':'待评估'}</dd></div><div><dt>评估时间</dt><dd>{selectedView.assessment.assessedAt}</dd></div></dl>:<span className="mg-muted">尚无当前生产版本评估</span>}</section>
   {teamsFor([selectedAgent.id]).length>0&&<section><div className="gov-section-heading"><Users size={15}/><h3>引用团队</h3></div><div className="gov-impact">{teamsFor([selectedAgent.id]).map(team=><span key={team.id}>{team.name}</span>)}</div></section>}
   {selectedView.issues.some(item=>item.status!=='resolved')&&<section><div className="gov-section-heading"><Clock3 size={15}/><h3>待处理</h3></div><div className="gov-issue-list">{selectedView.issues.filter(item=>item.status!=='resolved').map(item=><button key={item.id} className="gov-issue-row" onClick={()=>{closeAgent();setIssueId(item.id);setTab('issues');}}><span className="gov-issue-symbol"><ShieldOff size={16}/></span><span className="gov-issue-main"><strong>{item.title}</strong><small>{issueLabels[item.status]}</small></span><ChevronRight size={15}/></button>)}</div></section>}
  </div>}<DialogFooter><Button variant="outline" onClick={closeAgent}>关闭</Button>{selectedAgent&&<Button onClick={()=>onNavigate('builder','editor',selectedAgent.id)}>查看 Agent 配置<ArrowUpRight/></Button>}</DialogFooter></DialogContent></Dialog>

  <Dialog open={!!issue} onOpenChange={open=>{if(!open)closeIssue();}}><DialogContent className="gov-modal" aria-describedby={undefined}><DialogHeader><DialogTitle>{issue?.title||'整改待办'}</DialogTitle></DialogHeader>{issue&&<div className="gov-modal-body">
   <div className="gov-agent-heading">{issueAgent&&<AgentIcon icon={issueAgent.icon}/>}<div><h3>{issueAgent?.name||issue.agentId}</h3><p>{issue.version} · {issue.id}</p></div><IssueStage issue={issue}/></div>
   {issue.kind!=='false-positive'&&<Workflow issue={issue}/>}
   <Notice tone={issue.kind==='false-positive'?'info':issue.status==='resolved'?'success':'warning'}>{issue.status==='resolved'?'处理已完成，恢复依据与历史记录已保留。':issue.reason}</Notice>
   <dl className="gov-definition"><div><dt>Owner</dt><dd>{issue.owner}</dd></div><div><dt>Manager</dt><dd>{issue.manager}</dd></div><div><dt>处理期限</dt><dd>{issue.dueAt}</dd></div><div><dt>受影响版本</dt><dd>{issue.version}</dd></div><div><dt>Release</dt><dd><code>{issue.releaseId}</code></dd></div><div><dt>当前就绪</dt><dd>{issueView?<StateBadge state={issueView.readiness}/>: '—'}</dd></div></dl>
   {issue.kind!=='false-positive'&&<section><div className="gov-section-heading"><CheckCircle2 size={15}/><h3>恢复条件</h3><InfoTip label="恢复条件说明">更换同名策略、确认收到通知或关闭反馈均不会自动恢复。替换防护后，完成模拟复测与签署才能解除此问题的执行限制；其他未解决问题仍然有效。</InfoTip></div><div className="gov-evidence-row"><span><Link2 size={14}/>有效防护替换</span><strong>{issue.replacementReady?'已准备':'未完成'}</strong></div><div className="gov-evidence-row"><span><FlaskConical size={14}/>当前版本复测</span><strong>{issue.validationPassed?'已通过':'未通过'}</strong></div><div className="gov-evidence-row"><span><ShieldCheck size={14}/>恢复签署</span><strong>{issue.status==='resolved'?'已签署':'待签署'}</strong></div></section>}
   {issue.kind!=='false-positive'&&teamsFor([issue.agentId]).length>0&&<section><div className="gov-section-heading"><Users size={15}/><h3>引用团队</h3></div><div className="gov-impact">{teamsFor([issue.agentId]).map(team=><span key={team.id}>{team.name}</span>)}</div></section>}
   <section><div className="gov-section-heading"><GitBranch size={15}/><h3>处理记录</h3></div><ol className="gov-timeline">{issue.events.map((event,index)=><li key={`${index}-${event.time}`}><span className="gov-timeline-dot"/><div><strong>{event.label}</strong><small>{event.time}</small></div></li>)}</ol></section>
   {error&&<p className="gov-error" role="alert">{error}</p>}
  </div>}<DialogFooter className="gov-modal-footer"><span className="gov-modal-source"><FlaskConical/>模拟事件与签署</span><Button variant="outline" onClick={closeIssue}>关闭</Button>{issue?.status==='open'&&<Button onClick={()=>act('acknowledge')}>确认接手</Button>}{issue?.kind==='false-positive'&&issue.status==='acknowledged'&&<Button onClick={()=>act('dismiss-feedback')}>完成调查，保持使用范围</Button>}{issue&&issue.kind!=='false-positive'&&['acknowledged','remediating'].includes(issue.status)&&<Button onClick={()=>act('replace')}>替换防护</Button>}{issue?.status==='validating'&&<Button onClick={()=>act('retest')}><FlaskConical/>模拟复测</Button>}{issue?.status==='awaiting-approval'&&<Button onClick={()=>act('approve-recovery')}><ShieldCheck/>模拟签署并恢复</Button>}</DialogFooter></DialogContent></Dialog>

  <Dialog open={eventOpen} onOpenChange={open=>{setEventOpen(open);setError('');}}><DialogContent className="gov-modal" aria-describedby="gov-event-description"><DialogHeader><DialogTitle>演示 Guardrail 事件</DialogTitle><DialogDescription id="gov-event-description">仅更新当前浏览器中的 Agent、待办与执行状态。</DialogDescription></DialogHeader><div className="gov-modal-body">
   <Field label="生产 Agent"><select className="gov-event-select" value={eventAgent} onChange={e=>setEventAgent(e.target.value)}>{state.agents.filter(agent=>agent.activeVersion).map(agent=><option key={agent.id} value={agent.id}>{agent.name} · {agent.activeVersion}</option>)}</select></Field>
   <div className="gov-event-options" role="radiogroup" aria-label="演示事件类型">{scenarios.map(item=><label key={item.value}><input type="radio" name="gov-scenario" value={item.value} checked={scenario===item.value} onChange={()=>setScenario(item.value)}/><span><strong>{item.title}</strong><small>{item.description}</small></span></label>)}</div>
   {scenario!=='false-positive'&&<Notice tone="warning">{scenario==='revoke-action'?'仅一般任务保持可用；受保护业务动作将被阻止。':'受影响版本将暂停执行，历史任务与成果保留。'}{affectedAgents.length>0&&<div className="gov-impact" style={{marginTop:12}}>{affectedAgents.map(agent=><span key={agent.id}>{agent.name}</span>)}{affectedTeams.map(team=><span key={team.id}><Users size={12}/>{team.name}</span>)}{affectedWorkCount>0&&<span>{affectedWorkCount} 个进行中任务</span>}</div>}</Notice>}
   {error&&<p className="gov-error" role="alert">{error}</p>}
  </div><DialogFooter><Button variant="outline" onClick={()=>setEventOpen(false)}>取消</Button><Button variant={scenario==='false-positive'?'default':'destructive'} onClick={simulate}>触发模拟事件</Button></DialogFooter></DialogContent></Dialog>
 </div>;
}
