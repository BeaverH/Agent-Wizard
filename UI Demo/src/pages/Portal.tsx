import { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Check, ChevronRight, CircleAlert, Clock3, Copy, History, Loader2, MessageSquare, Send, Sparkles, Star, X } from 'lucide-react';
import { type Agent, type Run, labels } from '@/model';
import { useDemo, type PageProps } from '@/store';
import { AgentIcon, EmptyState, Field, InfoTip, Notice, PageHeader, SearchBox, SectionTitle, StatusBadge } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import '@/styles/portal.css';
import {useWorks} from '@/work-store';
import {canSeeWorkRun} from '@/work-model';
import {getAgentGovernance,governanceGate,portalReadinessLabels} from '@/governance';

const categories = ['全部', '业务协作', '知识问答', '专业服务', '数据分析', '办公效率'];
const scenarios: { value: Run['scenario']; label: string }[] = [{ value: 'normal', label: '正常完成' }, { value: 'approval', label: '人工确认' }, { value: 'failure', label: '工具异常' }, { value: 'guardrail', label: '策略拦截' }, { value: 'timeout', label: '运行超时' }];
const terminal = ['success', 'failed', 'blocked', 'cancelled', 'timeout'];

function samplePrompts(agent: Agent) {
  if (agent.icon === 'knowledge') return ['出差报销需要准备哪些材料？', '新员工入职第一周需要完成哪些事项？'];
  if (agent.icon === 'contract') return ['帮我核对合同中的付款和违约条款。', '审阅这份服务合同的关键风险。'];
  return ['采购 3 台笔记本电脑，预算 24,000 元，需要走什么流程？', '帮我整理一份办公设备采购需求清单。'];
}

function downloadResult(run: Run, name: string) {
  const text = `${name}\n任务 ${run.id}\n实际版本 ${run.version}\n状态 ${labels[run.status]}\n\n任务内容\n${run.input}\n\n结果\n${run.result || run.reason}\n\nAgent Wizard 纯前端演示 · 模拟结果`;
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = `${run.id}.txt`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Portal({ page, selectedId, onNavigate }: PageProps) {
  const { state, requestAccess, startRun, notify } = useDemo();
  const collaboration=useWorks();
  const allowedRuns=state.runs.filter(r=>canSeeWorkRun(collaboration.state.works,collaboration.actorId,r));
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('全部');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [favorites, setFavorites] = useState<string[]>(() => { try { const value = JSON.parse(localStorage.getItem('agent-wizard-favorites') || '[]'); return Array.isArray(value) ? value.filter(v => typeof v === 'string') : []; } catch { return []; } });
  const [currentAgent, setCurrentAgent] = useState<string | null>(null);
  const [accessAgent, setAccessAgent] = useState<Agent | null>(null);
  const [purpose, setPurpose] = useState('');
  const [taskInput, setTaskInput] = useState('');
  const [scenario, setScenario] = useState<Run['scenario']>('normal');
  const [status, setStatus] = useState('all');
  useEffect(() => { try { localStorage.setItem('agent-wizard-favorites', JSON.stringify(favorites)); } catch {} }, [favorites]);
  useEffect(() => { if (selectedId && state.agents.some(a => a.id === selectedId)) setCurrentAgent(selectedId); }, [selectedId, state.agents]);
  const selectedAgent = state.agents.find(a => a.id === currentAgent);
  const listed = state.agents.filter(a => a.catalog === 'listed');
  const shown = listed.filter(a => (category === '全部' || a.category === category) && (!onlyFavorites || favorites.includes(a.id)) && `${a.name} ${a.description} ${a.owner}`.toLowerCase().includes(search.toLowerCase()));
  const toggleFavorite = (id: string) => setFavorites(f => f.includes(id) ? f.filter(v => v !== id) : [...f, id]);
  const openAgent = (a: Agent) => { setCurrentAgent(a.id); setTaskInput(''); setScenario('normal'); };
  const submitRun = () => {
    if (!selectedAgent) return;
    const runId = startRun(selectedAgent.id, taskInput, scenario);
    if (runId) { setCurrentAgent(null); setTaskInput(''); onNavigate('portal', 'run', runId); }
  };
  const run = allowedRuns.find(r => r.id === selectedId);
  if(page==='run'&&!run)return <><PageHeader title="执行详情"/><EmptyState title="无权查看或执行记录不存在" action={<Button onClick={()=>onNavigate('portal','tasks')}>返回任务</Button>}/></>;
  if (page === 'run' && run) return <RunDetail run={run} onNavigate={onNavigate} onAgain={id => { setCurrentAgent(id); setTaskInput(''); onNavigate('portal', 'catalog', id); }} />;

  if (page === 'tasks') {
    const filtered = allowedRuns.filter(r => (status === 'all' || r.status === status) && `${r.id} ${r.input} ${state.agents.find(a => a.id === r.agentId)?.name}`.toLowerCase().includes(search.toLowerCase()));
    return <div className="portal-page">
      <PageHeader title="执行记录" actions={<Button onClick={() => onNavigate('portal', 'catalog')}><Sparkles size={15} />发起新任务</Button>} />
      <div className="portal-task-overview">
        <TaskMetric label="全部任务" value={allowedRuns.length} /><TaskMetric label="已完成" value={allowedRuns.filter(r => r.status === 'success').length} /><TaskMetric label="等待确认" value={allowedRuns.filter(r => r.status === 'waiting').length} /><TaskMetric label="需要关注" value={allowedRuns.filter(r => ['failed', 'blocked', 'timeout'].includes(r.status)).length} />
      </div>
      <div className="portal-toolbar"><SearchBox value={search} onChange={setSearch} placeholder="搜索任务、Agent 或任务 ID…" /><Select value={status} onValueChange={setStatus}><SelectTrigger aria-label="筛选任务状态"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem>{(['queued', 'running', 'waiting', 'success', 'failed', 'blocked', 'cancelled', 'timeout'] as const).map(s => <SelectItem key={s} value={s}>{labels[s]}</SelectItem>)}</SelectContent></Select></div>
      <div className="portal-task-table-wrap"><table className="portal-task-table"><thead><tr><th>任务 / 输入摘要</th><th>Agent</th><th>实际版本</th><th>执行状态</th><th>发起时间</th><th><span className="sr-only">查看</span></th></tr></thead><tbody>{filtered.map(r => { const a = state.agents.find(a => a.id === r.agentId); return <tr key={r.id} onClick={() => onNavigate('portal', 'run', r.id)}><td><button className="portal-task-name" onClick={e => { e.stopPropagation(); onNavigate('portal', 'run', r.id); }}>{r.input}</button><span className="portal-code">{r.id}</span></td><td><span className="portal-table-agent">{a && <AgentIcon icon={a.icon} />}{a?.name || r.agentId}</span></td><td><span className="portal-version">{r.version}</span></td><td><StatusBadge status={r.status} /></td><td className="portal-table-time">{r.createdAt}</td><td><ChevronRight size={15} /></td></tr>; })}</tbody></table>{!filtered.length && <EmptyState title="暂无任务记录" description="调整筛选条件，或从 Agent 目录开始一次新任务。" />}</div>
    </div>;
  }

  return <div className="portal-page">
    <PageHeader title="Agent 目录" actions={<Button variant="outline" onClick={() => onNavigate('portal', 'runs')}><History size={15} />任务与历史</Button>} />
    <div className="portal-catalog-layout">
      <div className="portal-catalog-main">
        <div className="portal-catalog-controls"><div className="portal-toolbar"><SearchBox value={search} onChange={setSearch} placeholder="搜索 Agent 名称、用途或 Owner…" /><Button variant={onlyFavorites ? 'secondary' : 'outline'} onClick={() => setOnlyFavorites(v => !v)} aria-pressed={onlyFavorites}><Star size={14} fill={onlyFavorites ? 'currentColor' : 'none'} />我的收藏</Button></div><div className="portal-categories" aria-label="Agent 分类">{categories.map(c => <button key={c} className={category === c ? 'active' : ''} onClick={() => setCategory(c)}>{c}{c === '全部' && <span>{listed.length}</span>}</button>)}</div></div>
        <div className="portal-agent-grid">{shown.map(a => { const availability=getAgentGovernance(state,a); const available = a.enabled && a.deployment === 'available' && availability.readiness!=='not-ready'; const canUse = a.access === 'granted'; return <article className={`portal-agent-card ${currentAgent === a.id ? 'selected' : ''}`} key={a.id}><div className="portal-agent-card-top"><AgentIcon icon={a.icon} /><button className={`portal-star ${favorites.includes(a.id) ? 'is-favorite' : ''}`} aria-label={`${favorites.includes(a.id) ? '取消收藏' : '收藏'}${a.name}`} onClick={() => toggleFavorite(a.id)}><Star size={17} fill={favorites.includes(a.id) ? 'currentColor' : 'none'} /></button></div><button className="portal-card-title" onClick={() => openAgent(a)}>{a.name}<ArrowUpRight size={15} /></button><p className="portal-card-desc">{a.description}</p><div className="portal-card-tags"><Badge variant="secondary">{a.category}</Badge><span className="portal-version">{a.activeVersion || '版本未知'}</span></div><div className="portal-card-owner"><span className="portal-avatar">{a.owner.slice(0, 1)}</span><span>{a.owner}</span><span className={`portal-service-dot ${available ? 'available' : ''}`} />{available ? portalReadinessLabels[availability.readiness] : '暂不可用'}</div><div className="portal-card-bottom">{!available ? <Button variant="outline" disabled>当前不可用</Button> : canUse ? <Button variant="outline" onClick={() => openAgent(a)}>开始使用<ArrowRight size={14} /></Button> : a.access === 'pending' ? <Button variant="outline" disabled><Clock3 size={14} />访问申请待审</Button> : <Button variant="outline" onClick={() => { setAccessAgent(a); setPurpose(''); }}>申请访问<ArrowUpRight size={14} /></Button>}</div></article>; })}</div>
        {!shown.length && <EmptyState title={onlyFavorites ? '还没有匹配的收藏' : '没有找到匹配的 Agent'} description="试试其他关键词或分类。" action={<Button variant="outline" onClick={() => { setSearch(''); setCategory('全部'); setOnlyFavorites(false); }}>重置筛选</Button>} />}
      </div>
      {selectedAgent && <aside className="portal-start-panel"><div className="portal-start-head"><span>新任务</span><button aria-label="关闭任务面板" onClick={() => setCurrentAgent(null)}><X size={18} /></button></div><div className="portal-start-agent"><AgentIcon icon={selectedAgent.icon} /><h2>{selectedAgent.name}</h2><div><span className="portal-version">{selectedAgent.activeVersion || '尚无可用版本'}</span><StatusBadge status={selectedAgent.deployment} /></div></div><div className="portal-start-body">{selectedAgent.access !== 'granted' ? <><Button disabled={selectedAgent.access === 'pending'} onClick={() => { setAccessAgent(selectedAgent); setPurpose(''); }}>{selectedAgent.access === 'pending' ? '访问申请待审' : '申请访问'}</Button></> : !selectedAgent.enabled || selectedAgent.deployment !== 'available' || !governanceGate(state,selectedAgent.id).allowed ? <Notice tone="warning">{getAgentGovernance(state,selectedAgent).userReason||'服务暂停，暂时无法发起任务。'}</Notice> : <>{getAgentGovernance(state,selectedAgent).readiness==='limited'&&<Notice tone="warning">仅支持查询，暂不执行业务操作。</Notice>}<div className="portal-prompts">{samplePrompts(selectedAgent).map(p => <button key={p} onClick={() => setTaskInput(p)}>{p}<ArrowUpRight size={14} /></button>)}</div><Field label="任务内容"><Textarea aria-label="任务内容" placeholder="描述你希望完成的任务…" rows={5} value={taskInput} onChange={e => setTaskInput(e.target.value)} /></Field><Field label="演示情境" hint="选择任务的运行结果。"><Select value={scenario} onValueChange={v => setScenario(v as Run['scenario'])}><SelectTrigger aria-label="演示情境"><SelectValue /></SelectTrigger><SelectContent>{scenarios.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select></Field><Button className="portal-submit" disabled={!taskInput.trim()} onClick={submitRun}>发起任务<Send size={15} /></Button></>}</div></aside>}
    </div>
    <Dialog open={!!accessAgent} onOpenChange={open => !open && setAccessAgent(null)}><DialogContent aria-describedby={undefined}><DialogHeader><DialogTitle>申请访问</DialogTitle></DialogHeader><div className="portal-dialog-body">{accessAgent && <div className="portal-dialog-agent"><AgentIcon icon={accessAgent.icon} /><div><strong>{accessAgent.name}</strong><p>Owner · {accessAgent.owner}</p></div></div>}<Field label="申请理由" hint="说明需要使用此 Agent 的业务场景。"><Textarea autoFocus aria-label="申请理由" rows={4} placeholder="例如：协助项目日常合同初审…" value={purpose} onChange={e => setPurpose(e.target.value)} /></Field><div className="portal-request-meta"><span>申请人：黄小明</span><span>范围：当前项目</span></div></div><DialogFooter><Button variant="outline" onClick={() => setAccessAgent(null)}>取消</Button><Button disabled={!purpose.trim()} onClick={() => { if (accessAgent) { requestAccess(accessAgent.id, purpose.trim()); setAccessAgent(null); notify('访问申请已提交。'); } }}>提交申请</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function TaskMetric({ label, value }: { label: string; value: number }) { return <div><span>{label}</span><strong>{value.toString().padStart(2, '0')}</strong></div>; }

function RunDetail({ run, onNavigate, onAgain }: { run: Run; onNavigate: PageProps['onNavigate']; onAgain: (id: string) => void }) {
  const { state, confirmRun, addFeedback, reportGovernanceFeedback, notify } = useDemo();
  const {actorId}=useWorks();
  const agent = state.agents.find(a => a.id === run.agentId);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState('结果不准确');
  const [feedbackText, setFeedbackText] = useState('');
  const [copied, setCopied] = useState(false);
  const feedback = useMemo(() => state.feedback.filter(f => f.runId === run.id), [state.feedback, run.id]);
  const pending = run.status === 'queued' || run.status === 'running';
  const failed = ['failed', 'blocked', 'cancelled', 'timeout'].includes(run.status);
  const governance=agent?getAgentGovernance(state,agent):undefined;
  const canStart = !!agent && agent.access === 'granted' && agent.enabled && agent.deployment === 'available' && governanceGate(state,agent.id).allowed;
  const confirmationGate=governanceGate(state,run.agentId,'protected-action',run.releaseId);
  const ownsRun=(run.initiatorId||'u-huang')===actorId;
  const mayReport=run.status==='blocked'&&run.scenario==='guardrail'&&ownsRun;
  const copy = async () => { try { await navigator.clipboard.writeText(run.result || run.reason); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { notify('浏览器不允许复制，可使用下载结果保存文本。'); } };
  return <div className="portal-page portal-run-page">
    <button className="portal-back" onClick={() => onNavigate('portal', 'runs')}><ArrowLeft size={14} />执行记录</button>
    <PageHeader title="执行详情" actions={<><Button variant="outline" disabled={!canStart} onClick={() => onAgain(run.agentId)}>发起新任务<ArrowUpRight size={14} /></Button>{terminal.includes(run.status) && <Button onClick={() => setFeedbackOpen(true)}><MessageSquare size={14} />提交反馈</Button>}</>} />
    {run.workId&&<button className="portal-back" onClick={()=>onNavigate('portal','work',run.workId)}>返回协作任务<ArrowUpRight size={14}/></button>}<div className="portal-run-summary"><div className="portal-run-agent">{agent && <AgentIcon icon={agent.icon} />}<div><strong>{agent?.name || run.agentId}</strong><span className="portal-code">{run.id}</span></div></div><div className="portal-run-summary-status"><span>{run.createdAt}</span><StatusBadge status={run.status} /></div></div>
    {governance&&governance.readiness!=='ready'&&<Notice tone="warning">当前 Agent：{governance.userReason} 历史执行记录保留。</Notice>}<div className="portal-run-layout"><div className="portal-run-content">
      <section className="portal-run-card"><SectionTitle title="任务输入" /><div className="portal-user-message"><span className="portal-user-avatar">黄</span><div><strong>{run.initiatorName||'黄小明'}</strong><p>{run.input}</p></div></div></section>
      <section className="portal-run-card"><div className="portal-run-result-title"><div><Sparkles size={17} /><h2>执行结果</h2></div></div>
        {pending && <div className="portal-progress-state"><div className="portal-progress-icon"><Loader2 size={25} /></div><h3>{run.status === 'queued' ? '任务已接收' : '正在整理结果'}</h3><p>{run.status === 'queued' ? '等待执行。' : '正在检索资料并检查结果。'}</p><div className="portal-progress-track"><span /></div></div>}
        {run.status === 'waiting' && <div className="portal-confirmation"><div className="portal-confirmation-title"><Clock3 size={21} /><div><h3>确认提交采购申请</h3><p>确认后提交申请；拒绝或超时不会提交。</p></div></div><dl><div><dt>待执行动作</dt><dd>提交采购申请草稿</dd></div><div><dt>申请内容</dt><dd>{run.input}</dd></div><div><dt>确认人</dt><dd>黄小明 · 任务发起人</dd></div><div><dt>影响范围</dt><dd>本次 Run · 一次受保护的提交动作</dd></div></dl>{!confirmationGate.allowed&&<Notice tone="warning">{confirmationGate.reason}</Notice>}<div className="portal-confirm-actions"><Button disabled={!confirmationGate.allowed} title={!confirmationGate.allowed?confirmationGate.reason:undefined} onClick={() => confirmRun(run.id, 'approve')}><Check size={15} />确认提交</Button><Button variant="outline" onClick={() => confirmRun(run.id, 'reject')}>拒绝执行</Button><button className="portal-timeout-link" onClick={() => confirmRun(run.id, 'timeout')}>模拟确认超时</button></div></div>}
        {run.status === 'success' && <><div className="portal-result-text">{run.result}</div><div className="portal-citations"><BookOpen size={16} /><div><strong>{agent?.icon === 'knowledge' ? '员工知识手册' : '采购管理制度'}</strong><span>{agent?.icon === 'knowledge' ? '企业共享知识' : '第 3.2 节 · 采购申请与审批'}</span></div></div><div className="portal-result-actions"><Button size="sm" variant="outline" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? '已复制' : '复制结果'}</Button><Button size="sm" variant="outline" onClick={() => downloadResult(run, agent?.name || run.agentId)}><ArrowDownToLine size={14} />下载结果</Button></div></>}
        {failed && <div className={`portal-failure ${run.status === 'blocked' ? 'blocked' : ''}`}><CircleAlert size={25} /><h3>{run.status === 'blocked' ? (run.scenario==='guardrail'?'请求已被策略拦截':'执行已暂停') : run.status === 'cancelled' ? '任务已取消' : run.status === 'timeout' ? '任务已超时' : '任务未能完成'}</h3><p>{run.reason || '执行未完成，请查看事件记录以了解详情。'}</p><div className="portal-failure-guidance">{run.status === 'blocked' ? (!canStart?'此 Agent 暂不可用。历史内容仍可查看，请联系负责人。':'如果认为请求被误拦截，可提交疑似误报反馈；也可调整请求后重试。') : run.status === 'cancelled' ? '如需继续，请发起新任务。' : '检查服务连接后重新发起，或反馈问题。'}</div><Button variant="outline" size="sm" onClick={() => {if(mayReport)setFeedbackCategory('疑似误报');setFeedbackOpen(true);}}><MessageSquare size={14} />{mayReport?'报告疑似误报':'反馈问题'}</Button></div>}
      </section>
      {!!feedback.length && <section className="portal-run-card"><SectionTitle title="关联反馈" /><div className="portal-feedback-list">{feedback.map(f => <div key={f.id}><div><strong>{f.category}</strong><StatusBadge status={f.status} /></div><p>{f.text}</p><span>{f.id} · {f.version} · {f.createdAt}</span></div>)}</div></section>}
    </div><aside className="portal-run-aside"><section className="portal-run-card"><SectionTitle title="运行信息" action={<InfoTip label="版本追溯说明">版本记录固定，不随后续草稿修改而变化。</InfoTip>} /><dl className="portal-run-meta"><div><dt>Agent ID</dt><dd>{run.agentId}</dd></div><div><dt>实际版本</dt><dd><span className="portal-version">{run.version}</span></dd></div><div><dt>Release</dt><dd>{run.releaseId}</dd></div><div><dt>Deployment</dt><dd>{run.deploymentId}</dd></div><div><dt>执行 Session</dt><dd>{run.sessionId}</dd></div>{run.conversationId&&<div><dt>来源会话</dt><dd>{run.conversationId}</dd></div>}<div><dt>发起人</dt><dd>{run.initiatorName||'黄小明'}</dd></div><div><dt>工作范围</dt><dd>数字化创新 / 当前项目</dd></div></dl></section><section className="portal-run-card"><SectionTitle title="执行事件" /><ol className="portal-event-list">{run.events.map((e, i) => <li key={`${e.time}-${i}`} className={i === run.events.length - 1 ? 'current' : ''}><span className="portal-event-dot" /><div><p>{e.label}</p><time>{e.time}</time></div></li>)}</ol></section></aside></div>
    <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}><DialogContent aria-describedby={undefined}><DialogHeader><DialogTitle>提交反馈</DialogTitle></DialogHeader><div className="portal-dialog-body"><div className="portal-feedback-context"><span>关联任务</span><strong>{run.id}</strong><span>实际版本</span><strong>{run.version}</strong></div><Field label="反馈类别"><Select value={feedbackCategory} onValueChange={setFeedbackCategory}><SelectTrigger aria-label="反馈类别"><SelectValue /></SelectTrigger><SelectContent>{[...(mayReport?['疑似误报']:[]),'结果不准确', '引用有误', '运行问题', '使用建议', '其他'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></Field><Field label="具体说明"><Textarea aria-label="反馈说明" placeholder="描述遇到的问题，或你期望的结果…" rows={4} value={feedbackText} onChange={e => setFeedbackText(e.target.value)} /></Field></div><DialogFooter><Button variant="outline" onClick={() => setFeedbackOpen(false)}>取消</Button><Button disabled={!feedbackText.trim()} onClick={() => {if(feedbackCategory==='疑似误报'){if(!mayReport||!reportGovernanceFeedback(run.id,feedbackText.trim()))return;}else addFeedback(run.id, feedbackCategory, feedbackText.trim());setFeedbackOpen(false);setFeedbackText('');}}>提交反馈</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
