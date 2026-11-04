import { ArrowRight, ExternalLink, FileCheck2, ShieldCheck } from 'lucide-react';
import type { Agent } from '@/model';
import { candidateAssessment, getAgentGovernance, readinessLabels, riskLabels } from '@/governance';
import { useDemo, type PageProps } from '@/store';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { EmptyState, InfoTip, Notice, StatusBadge } from './common';

const measureUrl='http://127.0.0.1:18082/v2/guardrails?role=approver#Profile/measure/';
const issueLabels={open:'待确认',acknowledged:'已确认',remediating:'整改中',validating:'待复测','awaiting-approval':'待恢复审批',resolved:'已解决'};
const bindingLabels={active:'生效中',revoked:'已撤销',pending:'待生效'};

export function GovernanceBadge({agent}:{agent:Agent}){
 const {state}=useDemo();
 const view=getAgentGovernance(state,agent);
 return <Badge variant="secondary" className={`gov-status gov-status-${view.readiness}`}><ShieldCheck size={12}/>{readinessLabels[view.readiness]}</Badge>;
}

export function GovernancePanel({agent,onNavigate}:{agent:Agent;onNavigate:PageProps['onNavigate']}){
 const {state,assessGovernance}=useDemo();
 const view=getAgentGovernance(state,agent);
 const active=agent.versions.find(version=>version.releaseId===view.releaseId);
 const issues=view.issues.filter(issue=>issue.status!=='resolved');
 const candidate=candidateAssessment(state,agent);
 const hasCandidate=agent.status!=='delivered'||!!active&&active.revision!==agent.revision;
 return <div className="gov-agent-panel">
  {hasCandidate&&<section className="panel gov-agent-candidate">
   <div className="panel-heading"><h2>待发布版本<InfoTip label="待发布版本评估说明">评估仅对应当前草稿修订，不改变生产版本。生效防护存在缺口时需先整改；保存新的配置后需要重新验证。</InfoTip></h2><span className="mono">{agent.nextVersion} · r{agent.revision}</span></div>
   <div className="dialog-body"><div className="gov-agent-candidate-result"><div>{candidate?<><StatusBadge status={candidate.status==='passed'?'pass':candidate.status==='failed'?'fail':'pending'}/><span className="mono">{candidate.reportId}</span><small>{candidate.assessedAt}</small></>:<span className="muted">当前修订尚未完成 Guardrail 验证</span>}</div><Button variant="outline" onClick={()=>assessGovernance(agent.id)}><ShieldCheck/>模拟 Guardrail 验证</Button></div>{candidate?.status==='failed'&&<Notice tone="warning">当前修订未通过。请检查防护绑定与待整改项，修复后重新验证。</Notice>}</div>
  </section>}
  <section className="panel">
   <div className="panel-heading"><h2><ShieldCheck size={17}/>当前生产版本</h2><span className="mono">{view.version||'尚未交付'}</span></div>
   <div className="dialog-body">
    <div className="gov-agent-summary">
     <div><span>治理状态</span><GovernanceBadge agent={agent}/></div>
     <div><span>评估风险<InfoTip label="风险评估说明">风险依据当前生产版本的模拟评估；扫描命中次数不直接决定风险。未评估不等于低风险。</InfoTip></span><Badge variant="outline" className={`gov-risk gov-risk-${view.risk}`}>{riskLabels[view.risk]}</Badge></div>
     <div><span>运行部署</span><StatusBadge status={agent.deployment}/></div>
     <div><span>发布记录</span><span className="mono">{view.releaseId||'—'}</span></div>
    </div>
    {view.readiness!=='ready'&&<Notice tone="warning">{view.reason}</Notice>}
    {view.restrictions.length>0&&<ul className="gov-agent-restrictions">{view.restrictions.map(item=><li key={item}>{item}</li>)}</ul>}
    {active&&active.revision!==agent.revision&&<Notice>当前草稿 r{agent.revision}；以下结果对应生产版本 {view.version} · r{active.revision}。</Notice>}
    <div className="button-row"><Button variant="outline" onClick={()=>onNavigate('management','policies',agent.id)}>管理防护与整改<ArrowRight/></Button><Button variant="ghost" asChild><a href={measureUrl} target="_blank" rel="noreferrer">Guardrail Measure<ExternalLink/></a></Button></div>
   </div>
  </section>

  <div className="gov-agent-layout">
   <section className="panel">
    <div className="panel-heading"><h2>生效防护</h2><InfoTip label="防护绑定说明">按生产发布版本关联 Profile、Guardrail 和 Policy。撤销状态仍保留历史引用。此处为本地演示绑定，未与 Guardrail 系统同步。</InfoTip></div>
    {view.bindings.length===0?<EmptyState title="尚无生产防护绑定"/>:<div className="gov-agent-bindings">{view.bindings.map(binding=><div className="gov-agent-binding" key={binding.id}>
     <div className="gov-agent-binding-heading"><strong>{binding.policyName}</strong><Badge variant={binding.status==='revoked'?'destructive':'outline'}>{bindingLabels[binding.status]}</Badge></div>
     <div className="gov-agent-binding-chain">
      <div className="gov-agent-binding-node"><span>Profile</span><strong>{binding.profileId}</strong><small className="mono">v{binding.profileVersion}</small></div><ArrowRight size={15}/>
      <div className="gov-agent-binding-node"><span>Guardrail</span><strong>{binding.guardrailName}</strong><small className="mono">{binding.guardrailId} · v{binding.guardrailVersion}</small></div><ArrowRight size={15}/>
      <div className="gov-agent-binding-node"><span>Policy</span><strong>{binding.policyName}</strong><small className="mono">{binding.policyId} · v{binding.policyVersion}</small></div>
     </div>
     <div className="gov-agent-scope">覆盖能力：{binding.scope==='all'?'全部执行':'受保护业务操作'}</div>
    </div>)}</div>}
   </section>

   <section className="panel">
    <div className="panel-heading"><h2><FileCheck2 size={17}/>最近评估</h2><InfoTip label="评估数据来源">本地模拟评估，不调用真实模型或 Guardrail。开发 Playground 的单次验证不替代防护评估。</InfoTip></div>
    {view.assessment?<div className="dialog-body gov-agent-evidence"><dl className="detail-list">
     <div><dt>结果</dt><dd><StatusBadge status={view.assessment.status==='passed'?'pass':view.assessment.status==='failed'?'fail':'pending'}/></dd></div>
     <div><dt>报告</dt><dd className="mono">{view.assessment.reportId}</dd></div>
     <div><dt>配置修订</dt><dd className="mono">r{view.assessment.revision}</dd></div>
     <div><dt>评估时间</dt><dd>{view.assessment.assessedAt||'—'}</dd></div>
     <div><dt>评估方法</dt><dd>{view.assessment.method}</dd></div>
    </dl></div>:<EmptyState title="尚无匹配评估"/>}
   </section>
  </div>

  <section className="panel">
   <div className="panel-heading"><h2>待处理问题</h2><Badge variant="secondary">{issues.length}</Badge></div>
   {issues.length===0?<EmptyState title="暂无待处理问题"/>:<div className="gov-agent-issue-list">{issues.map(issue=><button key={issue.id} onClick={()=>onNavigate('management','policies',issue.id)}><div><strong>{issue.title}</strong><small>{issue.owner} · {issueLabels[issue.status]} · 截止 {issue.dueAt}</small></div><ArrowRight size={16}/></button>)}</div>}
  </section>
 </div>;
}
