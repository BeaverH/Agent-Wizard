import { useEffect, useState } from 'react';
import { ArrowRight, Check, ChevronRight, Link2, Puzzle, ShieldCheck } from 'lucide-react';
import type { Agent, Resource } from '@/model';
import { governanceGate } from '@/governance';
import { getPublishedSkillAgents, skillExecutionGate } from '@/skill-model';
import { useDemo, type PageProps } from '@/store';
import { AgentIcon, EmptyState, Field, InfoTip, Notice, PageHeader, SearchBox, StatusBadge } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import '@/styles/skills.css';

interface SkillsProps { workspace:'builder'|'portal'; selectedId?:string; onNavigate:PageProps['onNavigate'] }
const statusLabel=(skill:Resource)=>skill.status==='offline'?'已停用':skill.status==='unauthorized'?'未授权':'可用';
const versionLabel=(skill:Resource)=>skill.version?`v${skill.version}`:'版本未知';
function SkillStatus({skill}:{skill:Resource}){return <StatusBadge status={skill.status==='offline'?'stopped':skill.status}>{statusLabel(skill)}</StatusBadge>;}
function hasUnsavedDraft(agent:Agent){try{const saved=JSON.parse(sessionStorage.getItem(`agent-wizard-unsaved-${agent.id}`)||'null');return saved?.revision===agent.revision&&!!saved.form;}catch{return false;}}

export default function Skills({workspace,selectedId,onNavigate}:SkillsProps){
 const demo=useDemo();
 const {state,saveAgent}=demo;
 const builder=workspace==='builder';
 const [query,setQuery]=useState('');
 const [filter,setFilter]=useState('all');
 const [detailId,setDetailId]=useState<string|null>(selectedId||null);
 const [bindId,setBindId]=useState<string|null>(null);
 const [agentId,setAgentId]=useState('');
 const [agentListId,setAgentListId]=useState<string|null>(null);
 const skills=state.resources.filter(resource=>resource.kind==='skill');
 const filtered=skills.filter(skill=>(filter==='all'||skill.status===filter)&&`${skill.name} ${skill.detail} ${skill.owner} ${skill.category||''} ${(skill.tags||[]).join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()));
 const detail=skills.find(skill=>skill.id===detailId);
 const binding=skills.find(skill=>skill.id===bindId);
 const agentListSkill=skills.find(skill=>skill.id===agentListId);
 const editable=state.agents.filter(agent=>agent.owner==='黄小明'&&agent.status!=='pending');
 const selectedAgent=editable.find(agent=>agent.id===agentId);
 const alreadyBound=!!selectedAgent&&!!binding&&(selectedAgent.skills||[]).includes(binding.id);
 const unsaved=!!selectedAgent&&hasUnsavedDraft(selectedAgent);
 useEffect(()=>{setDetailId(selectedId||null);},[selectedId]);

 function publishedAgents(skillId:string){return getPublishedSkillAgents(state,skillId);}
 function canUse(agent:Agent){return agent.enabled&&agent.deployment==='available'&&!!agent.activeVersion&&governanceGate(state,agent.id).allowed&&skillExecutionGate(state,agent.id).allowed;}
 function openBind(skill:Resource){
  if(skill.status!=='available')return;
  setDetailId(null);setBindId(skill.id);
  setAgentId(editable.find(agent=>!(agent.skills||[]).includes(skill.id))?.id||editable[0]?.id||'');
 }
 function saveBinding(){
  if(!binding||!selectedAgent||binding.status!=='available'||alreadyBound)return;
  if(hasUnsavedDraft(selectedAgent)){demo.notify('该 Agent 有未保存的编辑，请先保存配置后再绑定 Skill。');return;}
  if(saveAgent(selectedAgent.id,{skills:[...(selectedAgent.skills||[]),binding.id]})){
   setBindId(null);onNavigate('builder','editor',selectedAgent.id);
  }
 }
 function openAgents(skill:Resource){setDetailId(null);setAgentListId(skill.id);}
 const action=(skill:Resource,full=false)=>builder
  ?<Button size={full?'default':'sm'} variant="outline" disabled={skill.status!=='available'} onClick={()=>openBind(skill)}><Link2/>绑定 Agent</Button>
  :<Button size={full?'default':'sm'} variant="outline" disabled={skill.status!=='available'} onClick={()=>openAgents(skill)}>查看可用 Agent<ArrowRight/></Button>;

 return <div className="skills-page">
  <PageHeader title="Skill" description={builder?'可复用的指令与任务方法，绑定到 Agent 草稿后随版本交付。当前为本地演示，不安装或执行外部技能。':'浏览已共享的技能，通过已交付并获得授权的 Agent 使用。Skill 不作为独立执行服务。'} actions={builder?<Button variant="outline" onClick={()=>onNavigate('management','resources')}>管理共享资源<ArrowRight/></Button>:undefined}/>
  <div className="skills-toolbar">
   <div className="filter-pills" role="group" aria-label="Skill 状态筛选">{[['all','全部'],['available','可用'],['unauthorized','未授权'],['offline','已停用']].map(([value,label])=><button key={value} className={filter===value?'active':''} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label}{value==='all'&&<span>{skills.length}</span>}</button>)}</div>
   <SearchBox value={query} onChange={setQuery} placeholder="搜索 Skill、用途或 Owner…"/>
  </div>
  {filtered.length===0?<EmptyState title="暂无匹配的 Skill"/>:<div className="skills-grid">{filtered.map(skill=>{
   const published=publishedAgents(skill.id);
   const count=builder?state.agents.filter(agent=>(agent.skills||[]).includes(skill.id)).length:published.length;
   return <article className="skill-card" key={skill.id}>
    <div className="skill-card-top"><span className="skill-symbol"><Puzzle size={23} strokeWidth={1.6}/></span><SkillStatus skill={skill}/></div>
    <button className="skill-title" onClick={()=>setDetailId(skill.id)}><h2>{skill.name}</h2><ChevronRight size={16}/></button>
    <p className="skill-description">{skill.detail}</p>
    <div className="skill-tags">{skill.category&&<Badge variant="outline">{skill.category}</Badge>}{(skill.tags||[]).slice(0,2).map(tag=><span key={tag}>{tag}</span>)}</div>
    <div className="skill-meta"><span>{skill.owner}</span><span className="mono">{versionLabel(skill)}</span></div>
    <div className="skill-card-footer"><span>{builder?'已绑定':'已交付'} {count} 个 Agent</span>{action(skill)}</div>
   </article>;
  })}</div>}

  <Dialog open={!!detail} onOpenChange={open=>{if(!open)setDetailId(null);}}><DialogContent className="skill-detail-dialog" aria-describedby={undefined}>
   <DialogHeader><DialogTitle>Skill 详情</DialogTitle></DialogHeader>
   {detail&&<div className="skill-dialog-body">
    <div className="skill-detail-heading"><span className="skill-symbol"><Puzzle size={24}/></span><div><h3>{detail.name}</h3><span className="mono">{versionLabel(detail)}</span></div><SkillStatus skill={detail}/></div>
    <p className="skill-detail-purpose">{detail.detail}</p>
    <dl className="skill-details"><div><dt>Owner</dt><dd>{detail.owner}</dd></div><div><dt>共享范围</dt><dd>{detail.scope}</dd></div>{detail.category&&<div><dt>分类</dt><dd>{detail.category}</dd></div>}{detail.input&&<div><dt>输入</dt><dd>{detail.input}</dd></div>}{detail.output&&<div><dt>输出</dt><dd>{detail.output}</dd></div>}</dl>
    {builder&&detail.status==='available'&&detail.instructions&&<section className="skill-instructions"><h3>技能指令<InfoTip label="技能指令说明">此内容作为 Agent 版本的一部分交付；引用工具或知识时仍需单独授权。</InfoTip></h3><pre>{detail.instructions}</pre></section>}
    {detail.status!=='available'&&<Notice tone="warning">{detail.status==='unauthorized'?`当前项目尚未获准使用，请联系 ${detail.owner}。`:`此 Skill 已停用，请联系 ${detail.owner} 确认后续安排。`}</Notice>}
   </div>}
   <DialogFooter><Button variant="outline" onClick={()=>setDetailId(null)}>关闭</Button>{detail&&action(detail,true)}</DialogFooter>
  </DialogContent></Dialog>

  <Dialog open={!!binding} onOpenChange={open=>{if(!open)setBindId(null);}}><DialogContent className="skill-bind-dialog" aria-describedby={undefined}>
   <DialogHeader><DialogTitle>绑定 Agent</DialogTitle></DialogHeader>
   {binding&&<div className="skill-dialog-body">
    <div className="skill-binding-target"><Puzzle size={18}/><strong>{binding.name}</strong><span className="mono">{versionLabel(binding)}</span></div>
    {editable.length>0?<><Field label="Agent"><select value={agentId} onChange={event=>setAgentId(event.target.value)}>{editable.map(agent=><option key={agent.id} value={agent.id}>{agent.name}{(agent.skills||[]).includes(binding.id)?' · 已绑定':''}</option>)}</select></Field>{unsaved?<Notice tone="warning">该 Agent 有未保存的编辑。<Button size="sm" variant="link" onClick={()=>{setBindId(null);onNavigate('builder','editor',agentId);}}>打开并保存</Button></Notice>:<Notice>{alreadyBound?'所选 Agent 草稿已绑定此 Skill。':'保存后生成新的草稿修订，需要重新验证和发布。当前运行版本保持原配置。'}</Notice>}</>:<EmptyState title="暂无可编辑的 Agent" description="待审批的修订完成审批后可继续编辑。" action={<Button variant="outline" onClick={()=>{setBindId(null);onNavigate('builder','agents');}}>查看我的 Agents</Button>}/>}
   </div>}
   <DialogFooter><Button variant="outline" onClick={()=>setBindId(null)}>取消</Button><Button disabled={!selectedAgent||alreadyBound||unsaved||binding?.status!=='available'} onClick={saveBinding}><Check/>保存到草稿</Button></DialogFooter>
  </DialogContent></Dialog>

  <Dialog open={!!agentListSkill} onOpenChange={open=>{if(!open)setAgentListId(null);}}><DialogContent className="skill-agent-dialog" aria-describedby={undefined}>
   <DialogHeader><DialogTitle>使用 {agentListSkill?.name}</DialogTitle></DialogHeader>
   {agentListSkill&&<div className="skill-dialog-body">
    {publishedAgents(agentListSkill.id).length===0?<EmptyState title="暂无已交付 Agent" description={`请联系 ${agentListSkill.owner}。`}/>:<div className="skill-agent-list">{publishedAgents(agentListSkill.id).map(agent=>{
     const usable=agentListSkill.status==='available'&&canUse(agent);
     const granted=agent.access==='granted';
     const limited=usable&&getAgentReadiness(agent)==='limited';
     return <div className="skill-agent-row" key={agent.id}><AgentIcon icon={agent.icon}/><div><strong>{agent.name}</strong><span>{agent.owner} · {agent.activeVersion}</span>{limited&&<small>仅支持查询</small>}</div><Button size="sm" variant="outline" disabled={!usable} onClick={()=>{setAgentListId(null);onNavigate('portal','catalog',agent.id);}}>{!usable?'暂不可用':granted?'创建任务':'查看权限'}{usable&&<ArrowRight/>}</Button></div>;
    })}</div>}
    {publishedAgents(agentListSkill.id).length>0&&<div className="skill-agent-note"><ShieldCheck size={14}/><span>使用已交付版本，执行时再次检查权限与服务状态。</span></div>}
   </div>}
   <DialogFooter><Button variant="outline" onClick={()=>setAgentListId(null)}>关闭</Button></DialogFooter>
  </DialogContent></Dialog>
 </div>;

 function getAgentReadiness(agent:Agent){return governanceGate(state,agent.id,'protected-action').allowed?'ready':'limited';}
}
