import {GovernanceBadge} from '@/components/GovernancePanel';
import {getGovernanceIssues} from '@/governance';
import { useEffect, useState, type ReactNode } from 'react';
import { Activity, ArrowRight, ArrowUpRight, Bot, Check, CheckCheck, ChevronRight, ClipboardCheck, Database, FileCheck2, History, KeyRound, Link2, LockKeyhole, MessageSquareText, Play, SearchCheck, Server, ShieldCheck, ShieldX, Users, X, Zap, Puzzle } from 'lucide-react';
import { useDemo, type PageProps } from '@/store';
import { type Agent, type Approval, type Resource, labels } from '@/model';
import { AgentIcon, EmptyState, Field, InfoTip, Lifecycle, Metric, Notice, PageHeader, SearchBox, SectionTitle, StatusBadge, TextLink } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import '@/styles/management.css';

const resourceKinds = { model:'模型', knowledge:'知识库', tool:'工具 / 连接', skill:'Skill' };
const agentName = (agents:Agent[], id:string) => agents.find(agent => agent.id === id)?.name || id;
const matches = (query:string, ...values:(string | undefined)[]) => values.join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());

function FilterSelect({ label, value, onChange, children }:{label:string;value:string;onChange:(value:string)=>void;children:ReactNode}) {
  return <label className="mg-filter"><span>{label}</span><select aria-label={label} value={value} onChange={event=>onChange(event.target.value)}>{children}</select></label>;
}
function AgentCell({agent,onClick}:{agent:Agent;onClick?:()=>void}) {
  return <div className="mg-agent-cell"><AgentIcon icon={agent.icon}/><div>{onClick ? <button className="mg-name-link" onClick={onClick}>{agent.name}</button> : <strong>{agent.name}</strong>}<small>{agent.id} · {agent.category}</small></div></div>;
}
function Count({children}:{children:ReactNode}) { return <span className="mg-count">{children}</span>; }

function Overview({onNavigate}:PageProps) {
  const {state} = useDemo();
  const pendingRelease=state.approvals.filter(item=>item.type==='release'&&item.status==='pending');
  const pendingAccess=state.approvals.filter(item=>item.type==='access'&&item.status==='pending');
  const waitingRuns=state.runs.filter(run=>run.status==='waiting');
  const openFeedback=state.feedback.filter(item=>item.status==='open');
  const available=state.agents.filter(agent=>agent.enabled&&agent.deployment==='available');
  const runGroups=[
    {label:'执行成功',value:state.runs.filter(run=>run.status==='success').length,className:'success'},
    {label:'排队 / 执行中',value:state.runs.filter(run=>['queued','running'].includes(run.status)).length,className:'running'},
    {label:'等待人工确认',value:waitingRuns.length,className:'waiting'},
    {label:'失败 / 拦截 / 超时',value:state.runs.filter(run=>['failed','blocked','timeout'].includes(run.status)).length,className:'failed'},
    {label:'已取消',value:state.runs.filter(run=>run.status==='cancelled').length,className:'cancelled'},
  ];
  return <div className="mg-page">
    <PageHeader eyebrow="MANAGEMENT / OVERVIEW" title="运营概览" actions={<Button variant="outline" onClick={()=>onNavigate('management','audit')}><History/>审计记录</Button>}/>
    <div className="mg-metrics"><Metric label="Agent 资产" value={state.agents.length} icon={<Bot size={17}/>}/><Metric label="可用部署" value={available.length} icon={<Server size={17}/>}/><Metric label="待处理审批" value={pendingRelease.length+pendingAccess.length} icon={<ClipboardCheck size={17}/>}/><Metric label="待处理反馈" value={openFeedback.length} icon={<MessageSquareText size={17}/>}/></div>
    <div className="mg-overview-grid">
      <section className="mg-panel mg-todos"><SectionTitle title="待办事项"/>
        <button className="mg-todo-row" onClick={()=>onNavigate('management','approvals',pendingRelease[0]?.id)}><span className="mg-task-icon"><FileCheck2 size={19}/></span><span><strong>发布审批</strong></span><Count>{pendingRelease.length}</Count><ChevronRight size={16}/></button>
        <button className="mg-todo-row" onClick={()=>onNavigate('management','approvals',pendingAccess[0]?.id)}><span className="mg-task-icon"><KeyRound size={19}/></span><span><strong>访问审批</strong></span><Count>{pendingAccess.length}</Count><ChevronRight size={16}/></button>
        <button className="mg-todo-row" onClick={()=>waitingRuns[0]?onNavigate('portal','run',waitingRuns[0].id):onNavigate('portal','tasks')}><span className="mg-task-icon"><CheckCheck size={19}/></span><span><strong>任务执行确认</strong></span><Count>{waitingRuns.length}</Count><ArrowUpRight size={16}/></button>
      </section>
      <section className="mg-panel"><SectionTitle title="执行状态" action={<TextLink onClick={()=>onNavigate('portal','runs')}>执行记录</TextLink>}/>
        <div className="mg-run-total"><strong>{state.runs.length}</strong><span>次执行</span></div>
        <div className="mg-run-bars">{runGroups.map(group=><div className="mg-run-bar-row" key={group.label}><span>{group.label}</span><div className="mg-run-bar-track"><i className={group.className} style={{width:`${state.runs.length?group.value/state.runs.length*100:0}%`}}/></div><strong>{group.value}</strong></div>)}</div>

      </section>
    </div>
    <div className="mg-overview-grid mg-overview-lower">
      <section className="mg-panel"><SectionTitle title="近期管理操作" action={<TextLink onClick={()=>onNavigate('management','audit')}>全部记录</TextLink>}/><div className="mg-activity-list">{state.audit.slice(0,5).map(item=><div className="mg-activity" key={item.id}><span className="mg-activity-dot"/><div><strong>{item.action}</strong><p>{item.target}</p><small>{item.actor} · {item.createdAt}</small></div><span className="mg-plain-result">{item.result}</span></div>)}{!state.audit.length&&<EmptyState title="暂无管理操作" description="发布、授权与部署等操作将在这里留痕。"/>}</div></section>
      <section className="mg-panel"><SectionTitle title="资源与交付关注"/>
        <div className="mg-attention-list"><button onClick={()=>onNavigate('management','policies')}><ShieldCheck size={18}/><span>防护与整改待办</span><strong>{getGovernanceIssues(state).filter(i=>i.status!=='resolved').length}</strong><ChevronRight size={15}/></button><button onClick={()=>onNavigate('management','registry')}><Server size={18}/><span>部署异常或已停用</span><strong>{state.agents.filter(agent=>['failed','stopped'].includes(agent.deployment)).length}</strong><ChevronRight size={15}/></button><button onClick={()=>onNavigate('management','resources')}><Link2 size={18}/><span>连接异常的共享资源</span><strong>{state.resources.filter(r=>r.status==='offline').length}</strong><ChevronRight size={15}/></button><button onClick={()=>onNavigate('management','feedback')}><MessageSquareText size={18}/><span>待定位的任务反馈</span><strong>{openFeedback.length}</strong><ChevronRight size={15}/></button></div>

      </section>
    </div>
  </div>;
}

function Registry({selectedId,onNavigate}:PageProps) {
  const {state,deployAgent,toggleCatalog,toggleEnabled,revokeAccess} = useDemo();
  const [query,setQuery]=useState('');
  const [status,setStatus]=useState('all');
  const [deployment,setDeployment]=useState('all');
  const [selected,setSelected]=useState<string|undefined>(selectedId);
  const [revoke,setRevoke]=useState(false);
  const [actionConfirm,setActionConfirm]=useState<'unlist'|'stop'|null>(null);
  useEffect(()=>{setSelected(selectedId);setRevoke(false);},[selectedId]);
  useEffect(()=>{setActionConfirm(null);setRevoke(false);},[selected]);
  const agents=state.agents.filter(agent=>matches(query,agent.name,agent.description,agent.id,agent.owner)&&(status==='all'||agent.status===status)&&(deployment==='all'||agent.deployment===deployment));
  const agent=state.agents.find(item=>item.id===selected);
  return <div className="mg-page"><PageHeader eyebrow="MANAGEMENT / REGISTRY" title="注册与生命周期" actions={<Button variant="outline" onClick={()=>onNavigate('management','approvals')}><ClipboardCheck/>发布与访问审批</Button>}/>
    <div className="mg-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="搜索 Agent、ID 或 Owner…"/><FilterSelect label="版本状态" value={status} onChange={setStatus}><option value="all">全部状态</option>{['draft','pending','approved','rejected','delivered'].map(item=><option value={item} key={item}>{labels[item]}</option>)}</FilterSelect><FilterSelect label="运行部署" value={deployment} onChange={setDeployment}><option value="all">全部部署</option>{['none','available','failed','stopped'].map(item=><option value={item} key={item}>{labels[item]}</option>)}</FilterSelect></div>
    <section className="mg-panel mg-table-panel"><div className="mg-list-summary"><span>Agent 注册表 <Count>{agents.length}</Count></span></div><div className="mg-table-scroll"><table className="mg-table"><thead><tr><th>Agent / 身份</th><th>Owner</th><th>运行版本</th><th>版本 / 发布</th><th>部署</th><th>治理</th><th>目录</th><th className="mg-align-right">操作</th></tr></thead><tbody>{agents.map(item=><tr key={item.id}><td><AgentCell agent={item} onClick={()=>{setSelected(item.id);setRevoke(false);}}/></td><td>{item.owner}</td><td><code>{item.activeVersion||'—'}</code></td><td><StatusBadge status={item.status}/></td><td><StatusBadge status={item.deployment}/></td><td><button aria-label={`查看${item.name}防护状态`} onClick={()=>onNavigate('management','policies',item.id)}><GovernanceBadge agent={item}/></button></td><td><StatusBadge status={item.catalog}/></td><td className="mg-align-right"><Button variant="ghost" size="sm" onClick={()=>{setSelected(item.id);setRevoke(false);}}>管理<ArrowUpRight/></Button></td></tr>)}</tbody></table></div>{!agents.length&&<EmptyState/>}<div className="mg-table-foot">共 {agents.length} 个 Agent</div></section>
    <Dialog open={!!agent} onOpenChange={open=>{if(!open){setSelected(undefined);setRevoke(false);}}}><DialogContent className="mg-modal" aria-describedby={undefined}><DialogHeader><DialogTitle>{agent?.name}</DialogTitle></DialogHeader>{agent&&<div className="mg-modal-body">
      <p className="mg-muted">{agent.description}</p>
      <dl className="mg-definition-grid"><div><dt>Agent ID</dt><dd><code>{agent.id}</code></dd></div><div><dt>Owner</dt><dd>{agent.owner}</dd></div><div><dt>来源</dt><dd>Builder / 共享 Runtime</dd></div><div><dt>当前配置修订</dt><dd>r{agent.revision}</dd></div></dl>
      <h3>生命周期</h3><Lifecycle agent={agent}/><div className="mg-management-actions"><strong>防护与评估</strong><Button variant="outline" size="sm" onClick={()=>onNavigate('management','policies',agent.id)}><GovernanceBadge agent={agent}/>查看整改<ArrowUpRight/></Button></div>
      {agent.status==='approved'&&<Notice tone="warning">版本 {agent.nextVersion} 待部署。{agent.activeVersion?`当前运行 ${agent.activeVersion}。`:''}</Notice>}
      {agent.deployment==='failed'&&<Notice tone="warning">部署失败：Runtime 连接超时，目标版本尚不可用。</Notice>}
      <div className="mg-management-actions"><div><strong>部署</strong></div><div className="mg-action-group"><Button variant="outline" size="sm" disabled={agent.status!=='approved'} onClick={()=>deployAgent(agent.id,true)}>模拟部署失败</Button><Button size="sm" disabled={agent.status!=='approved'} onClick={()=>deployAgent(agent.id)}><Play/>{agent.deployment==='failed'?'重试部署':'模拟部署'}</Button></div></div>
      <div className="mg-management-actions"><div><strong>目录发现</strong></div><Button variant="outline" size="sm" disabled={agent.catalog==='unlisted'&&(!agent.activeVersion||agent.deployment!=='available'||!agent.enabled)} onClick={()=>{setRevoke(false);if(agent.catalog==='listed')setActionConfirm('unlist');else toggleCatalog(agent.id);}}>{agent.catalog==='listed'?'目录下架':'上架目录'}</Button></div>
      <div className="mg-management-actions"><div><strong>执行服务</strong></div><Button variant="outline" size="sm" disabled={!agent.activeVersion} onClick={()=>{setRevoke(false);if(agent.enabled&&agent.deployment!=='stopped')setActionConfirm('stop');else toggleEnabled(agent.id);}}>{agent.enabled&&agent.deployment!=='stopped'?'停用服务':'恢复服务'}</Button></div>
      <div className="mg-management-actions"><div><strong>当前用户的使用授权</strong><small>黄小明 · <StatusBadge status={agent.access}>{agent.access==='none'?'未授权':undefined}</StatusBadge></small></div><Button variant="destructive" size="sm" disabled={agent.access!=='granted'} onClick={()=>{setActionConfirm(null);setRevoke(true);}}>撤销访问</Button></div>
      {actionConfirm&&<div className="mg-confirm-box"><ShieldX size={19}/><div><strong>{actionConfirm==='stop'?'停用此 Agent 的执行服务？':'从目录下架此 Agent？'}</strong><p>{actionConfirm==='stop'?'停用后拒绝新任务，历史记录保留，在途任务继续。':'下架后目录不再展示此 Agent；已有服务与授权保留，不会停用执行服务。'}</p><div className="mg-action-group"><Button variant="outline" size="sm" onClick={()=>setActionConfirm(null)}>取消</Button><Button variant="destructive" size="sm" onClick={()=>{if(actionConfirm==='stop')toggleEnabled(agent.id);else toggleCatalog(agent.id);setActionConfirm(null);}}>{actionConfirm==='stop'?'确认停用':'确认下架'}</Button></div></div></div>}
      {revoke&&<div className="mg-confirm-box"><ShieldX size={19}/><div><strong>撤销黄小明对此 Agent 的使用权限？</strong><p>撤权后将拒绝黄小明的新任务，历史记录保留。在途任务继续。</p><div className="mg-action-group"><Button variant="outline" size="sm" onClick={()=>setRevoke(false)}>取消</Button><Button variant="destructive" size="sm" onClick={()=>{revokeAccess(agent.id);setRevoke(false);}}>确认撤权</Button></div></div></div>}
      <SectionTitle title="已交付版本"/>{agent.versions.length?<div className="mg-version-list">{agent.versions.map((version,index)=><div key={`${version.version}-${index}`}><code>{version.version}</code><span>修订 r{version.revision}</span><code>{version.releaseId}</code><small>{version.createdAt}</small></div>)}</div>:<p className="mg-muted">尚无已交付版本。</p>}
    </div>}<DialogFooter><Button variant="outline" onClick={()=>agent&&onNavigate('builder','editor',agent.id)}>前往 Builder<ArrowUpRight/></Button><Button variant="outline" onClick={()=>setSelected(undefined)}>关闭</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function Approvals({selectedId,onNavigate}:PageProps) {
  const {state,reviewApproval}=useDemo();
  const [query,setQuery]=useState('');const [type,setType]=useState('all');const [status,setStatus]=useState('pending');const [selected,setSelected]=useState<string|undefined>(selectedId);const [note,setNote]=useState('');
  useEffect(()=>{setSelected(selectedId);setNote('');},[selectedId]);
  const items=state.approvals.filter(item=>(type==='all'||item.type===type)&&(status==='all'||item.status===status)&&matches(query,item.id,agentName(state.agents,item.agentId),item.purpose));
  const approval=state.approvals.find(item=>item.id===selected);const agent=state.agents.find(item=>item.id===approval?.agentId);
  const open=(item:Approval)=>{setSelected(item.id);setNote(item.note||'');};
  return <div className="mg-page"><PageHeader eyebrow="MANAGEMENT / APPROVALS" title="发布与访问审批" description="审批资格、自审和重审规则待评审。发布批准、运行部署、目录上架分别生效；访问授权不替代底层资源授权。"/>
    <div className="mg-approval-types"><button className={type==='release'?'active':''} onClick={()=>setType(type==='release'?'all':'release')}><FileCheck2 size={21}/><div><strong>发布审批</strong></div><Count>{state.approvals.filter(a=>a.type==='release'&&a.status==='pending').length}</Count></button><button className={type==='access'?'active':''} onClick={()=>setType(type==='access'?'all':'access')}><KeyRound size={21}/><div><strong>访问审批</strong></div><Count>{state.approvals.filter(a=>a.type==='access'&&a.status==='pending').length}</Count></button><button onClick={()=>onNavigate('portal','tasks')}><CheckCheck size={21}/><div><strong>执行确认 <ArrowUpRight size={12}/></strong></div></button></div>
    <div className="mg-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="搜索申请编号、Agent 或申请内容…"/><FilterSelect label="审批类型" value={type} onChange={setType}><option value="all">全部类型</option><option value="release">发布审批</option><option value="access">访问审批</option></FilterSelect><FilterSelect label="审批状态" value={status} onChange={setStatus}><option value="all">全部状态</option><option value="pending">待审批</option><option value="approved">已批准</option><option value="rejected">已驳回</option></FilterSelect></div>
    <section className="mg-panel mg-table-panel"><div className="mg-list-summary"><span>审批记录 <Count>{items.length}</Count></span></div><div className="mg-table-scroll"><table className="mg-table"><thead><tr><th>申请</th><th>类型</th><th>目标版本</th><th>提交时间</th><th>状态</th><th className="mg-align-right">操作</th></tr></thead><tbody>{items.map(item=><tr key={item.id}><td><button className="mg-name-link" onClick={()=>open(item)}>{agentName(state.agents,item.agentId)}</button><small className="mg-table-sub">{item.id}</small></td><td><Badge variant="outline">{item.type==='release'?'发布审批':'访问审批'}</Badge></td><td><code>{item.version}</code></td><td className="mg-time">{item.createdAt}</td><td><StatusBadge status={item.status}/></td><td className="mg-align-right"><Button variant="ghost" size="sm" onClick={()=>open(item)}>{item.status==='pending'?'审核':'详情'}<ArrowUpRight/></Button></td></tr>)}</tbody></table></div>{!items.length&&<EmptyState title="暂无匹配的审批" description="可切换状态查看已处理记录；新的发布与访问申请会出现在这里。"/>}</section>
    <Dialog open={!!approval} onOpenChange={open=>{if(!open)setSelected(undefined);}}><DialogContent className="mg-modal mg-approval-modal"><DialogHeader><DialogTitle>{approval?.type==='release'?'发布审批':'访问审批'} · {agent?.name}</DialogTitle><DialogDescription>{approval?.id} · {approval?.createdAt}</DialogDescription></DialogHeader>{approval&&agent&&<div className="mg-modal-body"><div className="mg-detail-heading"><AgentIcon icon={agent.icon}/><div><strong>{agent.name}</strong><p>{approval.type==='release'?`Owner：${agent.owner}`:'申请主体：黄小明'}</p></div><StatusBadge status={approval.status}/></div>
      <dl className="mg-definition-grid"><div><dt>审批对象</dt><dd>{approval.type==='release'?`${approval.agentId} · ${approval.version} · r${approval.revision}`:`黄小明 → ${approval.agentId} 的使用权限`}</dd></div><div><dt>生效范围</dt><dd>{approval.type==='release'?'指定版本的发布资格':'当前用户对指定 Agent 的使用权限'}</dd></div></dl>
      <h3>申请说明</h3><div className="mg-prose-box">{approval.purpose}</div>
      {approval.type==='release'?<><h3>验证与修订证据</h3><div className="mg-evidence"><div><SearchCheck size={19}/><span>申请配置修订</span><strong>r{approval.revision}</strong></div><div><ClipboardCheck size={19}/><span>验证关联修订</span><strong>{approval.evidence?`r${approval.evidence.revision}`:'未保留快照'}</strong></div><div><ShieldCheck size={19}/><span>验证结果</span>{approval.evidence?<StatusBadge status={approval.evidence.result}/>:<span>未知</span>}</div></div>{approval.evidence?<><h3 className="mg-heading-with-info">被测输入<InfoTip label="验证证据说明">验证方法：{approval.evidence.method}。证据在提交时固定。</InfoTip></h3><div className="mg-prose-box">{approval.evidence.input}</div></>:<Notice tone="warning">历史验证证据未保留，无法确认当时的验证结果。</Notice>}{approval.status==='pending'&&approval.revision!==agent.revision&&<Notice tone="warning">申请修订与当前配置不一致，需重新验证并提交。</Notice>}<Notice>批准后获得发布资格，部署和上架需另行操作。</Notice></>:<Notice>批准仅授予此 Agent 的使用权限，底层资源授权保持独立。</Notice>}
      {approval.status==='pending'?<Field label="审批意见" hint="驳回时请填写原因。"><Textarea rows={3} value={note} onChange={event=>setNote(event.target.value)} placeholder="填写处理意见，或说明需要补充的证据…"/></Field>:<><h3>处理意见</h3><div className="mg-prose-box">{approval.note||'未填写处理意见。'}</div></>}
    </div>}<DialogFooter>{approval?.status==='pending'?<><Button variant="outline" onClick={()=>setSelected(undefined)}>稍后处理</Button><Button variant="destructive" disabled={!note.trim()} onClick={()=>reviewApproval(approval.id,false,note.trim())}><X/>驳回</Button><Button onClick={()=>reviewApproval(approval.id,true,note.trim())}><Check/>批准</Button></>:<><Button variant="outline" onClick={()=>setSelected(undefined)}>关闭</Button>{approval?.type==='release'&&<Button onClick={()=>onNavigate('management','registry',approval.agentId)}>查看交付状态<ArrowRight/></Button>}</>}</DialogFooter></DialogContent></Dialog>
  </div>;
}

function Resources({onNavigate}:PageProps) {
  const {state}=useDemo();const [query,setQuery]=useState('');const [kind,setKind]=useState('all');const [status,setStatus]=useState('all');const [selected,setSelected]=useState<string|undefined>();
  const items=state.resources.filter(resource=>(kind==='all'||resource.kind===kind)&&(status==='all'||resource.status===status)&&matches(query,resource.name,resource.owner,resource.id,resource.category));
  const resource=state.resources.find(item=>item.id===selected);
  const resourceAgents=(resource:Resource,published=false)=>state.agents.filter(agent=>{const source=published?agent.versions.find(v=>v.version===agent.activeVersion):agent;if(!source)return false;return resource.kind==='model'?source.model===resource.name:resource.kind==='skill'?(source.skills||[]).includes(resource.id):[...source.knowledge,...source.tools].includes(resource.id);});
  const resourceStatus=(r:Resource)=><StatusBadge status={r.kind==='skill'&&r.status==='offline'?'stopped':r.status}>{r.kind==='skill'&&r.status==='offline'?'已停用':undefined}</StatusBadge>;
  return <div className="mg-page"><PageHeader title="共享资源"/>
    <div className="mg-resource-summary">{(['model','knowledge','tool','skill'] as const).map(item=><button key={item} onClick={()=>setKind(kind===item?'all':item)} className={kind===item?'active':''}>{item==='model'?<Zap size={19}/>:item==='knowledge'?<Database size={19}/>:item==='skill'?<Puzzle size={19}/>:<Link2 size={19}/>}<span>{resourceKinds[item]}</span><strong>{state.resources.filter(r=>r.kind===item).length}</strong></button>)}</div>
    <div className="mg-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="搜索资源、ID 或 Owner…"/><FilterSelect label="资源类型" value={kind} onChange={setKind}><option value="all">全部类型</option>{Object.entries(resourceKinds).map(([value,label])=><option key={value} value={value}>{label}</option>)}</FilterSelect><FilterSelect label="可用状态" value={status} onChange={setStatus}><option value="all">全部状态</option><option value="available">可用</option><option value="unauthorized">未授权</option><option value="offline">连接异常 / 已停用</option></FilterSelect></div>
    <section className="mg-panel mg-table-panel"><div className="mg-table-scroll"><table className="mg-table"><thead><tr><th>资源</th><th>类型</th><th>Owner</th><th>版本</th><th>可用范围</th><th>状态</th><th className="mg-align-right">操作</th></tr></thead><tbody>{items.map(item=><tr key={item.id}><td><button className="mg-name-link" onClick={()=>setSelected(item.id)}>{item.name}</button><small className="mg-table-sub">{item.id}</small></td><td>{resourceKinds[item.kind]}</td><td>{item.owner}</td><td><code>{item.version||'—'}</code></td><td>{item.scope}</td><td>{resourceStatus(item)}</td><td className="mg-align-right"><Button size="sm" variant="ghost" onClick={()=>setSelected(item.id)}>详情<ArrowUpRight/></Button></td></tr>)}</tbody></table></div>{!items.length&&<EmptyState/>}<div className="mg-table-foot">共 {items.length} 项资源</div></section>
    <Dialog open={!!resource} onOpenChange={open=>{if(!open)setSelected(undefined);}}><DialogContent className="mg-modal mg-resource-modal" aria-describedby={undefined}><DialogHeader><DialogTitle>{resource?.name}</DialogTitle></DialogHeader>{resource&&<div className="mg-modal-body"><dl className="mg-definition-grid"><div><dt>资源 ID</dt><dd><code>{resource.id}</code></dd></div><div><dt>资源类型</dt><dd>{resourceKinds[resource.kind]}</dd></div><div><dt>Owner</dt><dd>{resource.owner}</dd></div><div><dt>可用范围</dt><dd>{resource.scope}</dd></div><div><dt>当前状态</dt><dd>{resourceStatus(resource)}</dd></div><div><dt>{resource.kind==='skill'?'版本':'准入方式'}</dt><dd>{resource.kind==='skill'?resource.version||'未知':'受控引用'}</dd></div></dl><div className="mg-prose-box">{resource.detail}</div>{resource.kind==='skill'&&<><dl className="mg-definition-grid">{resource.input&&<div><dt>输入</dt><dd>{resource.input}</dd></div>}{resource.output&&<div><dt>输出</dt><dd>{resource.output}</dd></div>}</dl>{resource.status==='available'&&resource.instructions&&<><h3>技能指令</h3><div className="mg-prose-box">{resource.instructions}</div></>}</>}{resource.status==='unauthorized'&&<Notice tone="warning">当前项目未获授权，无法绑定或调用此资源。</Notice>}{resource.status==='offline'&&<Notice tone="warning">{resource.kind==='skill'?'此 Skill 已停用。':'连接异常，无法使用。'}请联系 {resource.owner}。</Notice>}<h3>当前配置引用 <Count>{resourceAgents(resource).length}</Count></h3>{resourceAgents(resource).length?<div className="mg-linked-agents">{resourceAgents(resource).map(agent=><AgentCell key={agent.id} agent={agent} onClick={()=>onNavigate('builder','editor',agent.id)}/>)}</div>:<p className="mg-muted">暂无配置引用。</p>}{resource.kind==='skill'&&<><h3>生产版本引用 <Count>{resourceAgents(resource,true).length}</Count></h3>{resourceAgents(resource,true).length?<div className="mg-linked-agents">{resourceAgents(resource,true).map(agent=><AgentCell key={agent.id} agent={agent}/>)}</div>:<p className="mg-muted">暂无已交付引用。</p>}</>}</div>}<DialogFooter>{resource?.kind==='skill'&&<Button variant="outline" onClick={()=>onNavigate('builder','skills',resource.id)}>查看 Skill<ArrowUpRight/></Button>}<Button variant="outline" onClick={()=>setSelected(undefined)}>关闭</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function Access({onNavigate}:PageProps) {
  const {state,revokeAccess,requestAccess}=useDemo();const [query,setQuery]=useState('');const [status,setStatus]=useState('all');const [selected,setSelected]=useState<string|undefined>();const [purpose,setPurpose]=useState('');
  const agent=state.agents.find(item=>item.id===selected);
  const items=state.agents.filter(item=>(status==='all'||item.access===status)&&matches(query,item.name,item.id,item.owner));
  const roleMatrix=[
    {role:'Creator 创建者',scope:'被授权 Agent 与资源',edit:'编辑 / 验证',use:'按使用授权',review:'资格待确认',manage:'本人负责资产',content:'获准调试信息'},
    {role:'Consumer 使用者',scope:'本人或获授权任务',edit:'—',use:'按使用授权',review:'—',manage:'—',content:'本人或获授权内容'},
    {role:'Project Admin',scope:'授权项目范围',edit:'按编辑授权',use:'按使用授权',review:'资格待确认',manage:'项目资产与成员',content:'需单独授权'},
    {role:'BU/SU Admin',scope:'授权部门与项目',edit:'按编辑授权',use:'按使用授权',review:'资格待确认',manage:'共享与委托',content:'需单独授权'},
    {role:'Platform Admin',scope:'平台公共配置',edit:'按编辑授权',use:'按使用授权',review:'资格待确认',manage:'平台配置与运行',content:'需单独授权'},
    {role:'Reviewer 审批人员',scope:'匹配资格的审批对象',edit:'—',use:'按使用授权',review:'获授权审批',manage:'审批证据',content:'审批所需证据'},
  ];
  return <div className="mg-page"><PageHeader eyebrow="MANAGEMENT / ACCESS" title="组织与访问" actions={<Button variant="outline" onClick={()=>onNavigate('management','approvals')}><KeyRound/>查看访问审批</Button>}/>
    <section className="mg-scope-card"><span className="mg-task-icon"><Users size={22}/></span><div><strong>数字化创新 / 本项目</strong><p>授权主体：黄小明</p></div></section>
    <SectionTitle title="Agent 使用授权"/>
    <div className="mg-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="搜索 Agent、ID 或 Owner…"/><FilterSelect label="使用权限" value={status} onChange={setStatus}><option value="all">全部权限</option><option value="granted">已授权</option><option value="none">未授权</option><option value="pending">待审批</option><option value="revoked">已撤权</option></FilterSelect></div>
    <section className="mg-panel mg-table-panel"><div className="mg-table-scroll"><table className="mg-table"><thead><tr><th>Agent</th><th>授权主体</th><th>操作 / 范围</th><th>权限状态</th><th className="mg-align-right">操作</th></tr></thead><tbody>{items.map(item=><tr key={item.id}><td><AgentCell agent={item}/></td><td>黄小明</td><td>使用 · 本项目</td><td><StatusBadge status={item.access}>{item.access==='none'?'未授权':undefined}</StatusBadge></td><td className="mg-align-right">{item.access==='pending'?<Button variant="ghost" size="sm" onClick={()=>onNavigate('management','approvals',state.approvals.find(a=>a.agentId===item.id&&a.type==='access'&&a.status==='pending')?.id)}>查看审批<ArrowUpRight/></Button>:<Button variant={item.access==='granted'?'destructive':'outline'} size="sm" onClick={()=>{setSelected(item.id);setPurpose('');}}>{item.access==='granted'?'撤销授权':'申请访问'}</Button>}</td></tr>)}</tbody></table></div>{!items.length&&<EmptyState/>}</section>
    <SectionTitle title="角色与权限职责" description="PRD 建议职责。实际角色、兼任关系和审批资格待评审，管理角色不默认获得业务内容读取权。"/>
    <section className="mg-panel mg-table-panel"><div className="mg-table-scroll"><table className="mg-table mg-role-table"><thead><tr><th>职责角色</th><th>建议范围</th><th>编辑</th><th>使用</th><th>审批</th><th>管理</th><th>运行内容</th></tr></thead><tbody>{roleMatrix.map(row=><tr key={row.role}><td><strong>{row.role}</strong></td><td>{row.scope}</td><td>{row.edit}</td><td>{row.use}</td><td>{row.review}</td><td>{row.manage}</td><td>{row.content}</td></tr>)}</tbody></table></div></section>
    <Dialog open={!!agent} onOpenChange={open=>{if(!open)setSelected(undefined);}}><DialogContent className="mg-modal mg-access-modal"><DialogHeader><DialogTitle>{agent?.access==='granted'?'撤销 Agent 使用授权':'申请 Agent 使用权限'}</DialogTitle><DialogDescription>黄小明 → {agent?.name}</DialogDescription></DialogHeader>{agent&&<div className="mg-modal-body">{agent.access==='granted'?<Notice tone="warning">撤权后拒绝黄小明的新任务，历史记录保留。在途任务继续。</Notice>:<Field label="使用目的" hint="提交后需通过独立的访问审批，不会立即获得权限。"><Textarea value={purpose} onChange={event=>setPurpose(event.target.value)} placeholder="说明希望完成的任务与所需访问范围…" rows={3}/></Field>}</div>}<DialogFooter><Button variant="outline" onClick={()=>setSelected(undefined)}>取消</Button>{agent?.access==='granted'?<Button variant="destructive" onClick={()=>{revokeAccess(agent.id);setSelected(undefined);}}>确认撤权</Button>:<Button disabled={!purpose.trim()} onClick={()=>{if(agent){requestAccess(agent.id,purpose.trim());setSelected(undefined);}}}>提交访问申请<ArrowRight/></Button>}</DialogFooter></DialogContent></Dialog>
  </div>;
}

function Policies({onNavigate}:PageProps) {
  const policies=[
    {id:'DEMO-INPUT',title:'输入检查',icon:ShieldCheck,stage:'任务进入运行前',action:'命中受限敏感信息 → 拦截',evidence:'Run 状态为已拦截，保存明确原因和状态事件。',scope:'User Portal / Guardrail'},
    {id:'DEMO-CONFIRM',title:'受保护动作的人工确认',icon:CheckCheck,stage:'敏感工具动作执行前',action:'等待确认 → 确认、拒绝或超时',evidence:'确认绑定具体 Run；已处理确认不能重复执行。',scope:'采购申请服务 / 人工确认场景'},
    {id:'DEMO-RESOURCE',title:'受控资源引用',icon:LockKeyhole,stage:'配置绑定与任务使用',action:'未授权或连接不可用 → 禁止绑定',evidence:'保留资源 Owner、授权范围与连接状态。',scope:'共享模型、知识和工具'},
    {id:'DEMO-RELEASE',title:'验证与发布证据匹配',icon:ClipboardCheck,stage:'提交发布与发布批准时',action:'当前修订未通过验证 → 拒绝交付',evidence:'申请关联配置修订；发布批准、部署与上架分别记录。',scope:'Builder → Manager'},
  ];
  return <div className="mg-page"><PageHeader eyebrow="MANAGEMENT / POLICIES" title="安全与策略" description="只读演示规则。正式策略来源、绑定范围、审批资格及策略服务异常行为待确认；停用、撤权和数据保留规则待评审。" actions={<Button variant="outline" onClick={()=>onNavigate('management','audit')}><History/>治理留痕</Button>}/>
    <div className="mg-policy-grid">{policies.map(policy=><section className="mg-panel mg-policy-card" key={policy.id}><div className="mg-policy-heading"><span className="mg-task-icon"><policy.icon size={21}/></span><div><h2>{policy.title}</h2></div></div><dl><div><dt>适用范围</dt><dd>{policy.scope}</dd></div><div><dt>检查位置</dt><dd>{policy.stage}</dd></div><div><dt>处理动作</dt><dd>{policy.action}</dd></div><div><dt>可追溯证据</dt><dd>{policy.evidence}</dd></div></dl></section>)}</div>
  </div>;
}

function FeedbackPage({onNavigate}:PageProps) {
  const {state,resolveFeedback}=useDemo();const [query,setQuery]=useState('');const [status,setStatus]=useState('all');const [selected,setSelected]=useState<string|undefined>();
  const items=state.feedback.filter(item=>(status==='all'||item.status===status)&&matches(query,item.id,item.text,item.runId,agentName(state.agents,item.agentId)));
  const feedback=state.feedback.find(item=>item.id===selected);const run=state.runs.find(item=>item.id===feedback?.runId);
  return <div className="mg-page"><PageHeader eyebrow="MANAGEMENT / QUALITY" title="质量与反馈"/>
    <div className="mg-feedback-metrics"><Metric label="反馈记录" value={state.feedback.length} icon={<MessageSquareText size={17}/>}/><Metric label="待处理" value={state.feedback.filter(f=>f.status==='open').length} icon={<Activity size={17}/>}/><Metric label="已处理" value={state.feedback.filter(f=>f.status==='resolved').length} icon={<CheckCheck size={17}/>}/></div>
    <div className="mg-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="搜索反馈内容、Run 或 Agent…"/><FilterSelect label="处理状态" value={status} onChange={setStatus}><option value="all">全部状态</option><option value="open">待处理</option><option value="resolved">已处理</option></FilterSelect></div>
    <section className="mg-panel mg-table-panel"><div className="mg-table-scroll"><table className="mg-table"><thead><tr><th>反馈内容</th><th>关联 Agent / 版本</th><th>Run</th><th>提交时间</th><th>状态</th><th className="mg-align-right">操作</th></tr></thead><tbody>{items.map(item=><tr key={item.id}><td className="mg-feedback-text"><button className="mg-name-link" onClick={()=>setSelected(item.id)}>{item.category}</button><p>{item.text}</p><small className="mg-table-sub">{item.id}</small></td><td>{agentName(state.agents,item.agentId)}<small className="mg-table-sub"><code>{item.version}</code></small></td><td><button className="text-link" onClick={()=>onNavigate('portal','run',item.runId)}>{item.runId}<ArrowUpRight size={12}/></button></td><td className="mg-time">{item.createdAt}</td><td><StatusBadge status={item.status}/></td><td className="mg-align-right"><Button variant="ghost" size="sm" onClick={()=>setSelected(item.id)}>查看<ArrowUpRight/></Button></td></tr>)}</tbody></table></div>{!items.length&&<EmptyState title="暂无匹配反馈" description="用户可在任务结果中提交反馈，问题会关联到该 Run 与实际版本。"/>}</section>
    <Dialog open={!!feedback} onOpenChange={open=>{if(!open)setSelected(undefined);}}><DialogContent className="mg-modal mg-feedback-modal"><DialogHeader><DialogTitle>{feedback?.category}</DialogTitle><DialogDescription>{feedback?.id} · {feedback?.createdAt}</DialogDescription></DialogHeader>{feedback&&<div className="mg-modal-body"><dl className="mg-definition-grid"><div><dt>关联 Agent</dt><dd>{agentName(state.agents,feedback.agentId)}</dd></div><div><dt>实际运行版本</dt><dd><code>{feedback.version}</code></dd></div><div><dt>责任 Owner</dt><dd>{state.agents.find(a=>a.id===feedback.agentId)?.owner||'未知'}</dd></div><div><dt>处理状态</dt><dd><StatusBadge status={feedback.status}/></dd></div><div><dt>Run</dt><dd><code>{feedback.runId}</code></dd></div><div><dt>Release / Deployment</dt><dd><code>{run?.releaseId||'未知'}</code> / <code>{run?.deploymentId||'未知'}</code></dd></div></dl><h3>反馈内容</h3><div className="mg-prose-box">{feedback.text}</div>{run?.reason&&<Notice tone="warning">{run.reason}</Notice>}</div>}<DialogFooter><Button variant="outline" onClick={()=>feedback&&onNavigate('portal','run',feedback.runId)}>查看任务<ArrowUpRight/></Button>{feedback?.status==='open'?<Button onClick={()=>resolveFeedback(feedback.id)}><Check/>标记已处理</Button>:<Button variant="outline" onClick={()=>setSelected(undefined)}>关闭</Button>}</DialogFooter></DialogContent></Dialog>
  </div>;
}

function AuditPage() {
  const {state}=useDemo();const [query,setQuery]=useState('');const [action,setAction]=useState('all');
  const actions=[...new Set(state.audit.map(item=>item.action))];
  const items=state.audit.filter(item=>(action==='all'||item.action===action)&&matches(query,item.id,item.action,item.target,item.actor,item.result));
  return <div className="mg-page"><PageHeader eyebrow="MANAGEMENT / AUDIT" title="审计记录"/>
    <div className="mg-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="搜索操作、对象、操作者或结果…"/><FilterSelect label="操作类型" value={action} onChange={setAction}><option value="all">全部操作</option>{actions.map(item=><option key={item} value={item}>{item}</option>)}</FilterSelect></div>
    <section className="mg-panel mg-table-panel"><div className="mg-list-summary"><span>操作记录 <Count>{items.length}</Count></span></div><div className="mg-table-scroll"><table className="mg-table"><thead><tr><th>操作 / 记录 ID</th><th>作用对象</th><th>操作者</th><th>时间</th><th>结果</th></tr></thead><tbody>{items.map(item=><tr key={item.id}><td><strong className="mg-audit-action">{item.action}</strong><small className="mg-table-sub"><code>{item.id}</code></small></td><td className="mg-audit-target">{item.target}</td><td>{item.actor}</td><td className="mg-time">{item.createdAt}</td><td><span className={`mg-audit-result ${['失败','驳回','拒绝'].includes(item.result)?'bad':item.result==='待审'?'wait':'good'}`}>{item.result}</span></td></tr>)}</tbody></table></div>{!items.length&&<EmptyState title="暂无匹配记录" description="可调整搜索；管理操作发生后会自动记录。"/>}<div className="mg-table-foot">共 {items.length} 条操作</div></section>
  </div>;
}

export default function Management(props:PageProps) {
  switch(props.page) {
    case 'registry': return <Registry {...props}/>;
    case 'approvals': return <Approvals {...props}/>;
    case 'resources': return <Resources {...props}/>;
    case 'access': return <Access {...props}/>;
    case 'policies': return <Policies {...props}/>;
    case 'feedback': return <FeedbackPage {...props}/>;
    case 'audit': return <AuditPage/>;
    default: return <Overview {...props}/>;
  }
}
