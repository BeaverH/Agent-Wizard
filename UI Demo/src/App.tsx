import { useEffect, useState } from 'react';
import { DropdownMenu } from 'radix-ui';
import { Boxes, Hammer, Compass, ShieldCheck, Check, ChevronRight, ChevronsUpDown, PanelLeftClose, PanelLeftOpen, Bell, CircleHelp, LayoutGrid, FlaskConical, GitBranch, Database, Wrench, ListTodo, Activity, Network, Users, SlidersHorizontal, MessageSquareText, ScrollText, RotateCcw, CheckCircle2, Menu, X, Building2, Puzzle } from 'lucide-react';
import { Button } from './components/ui/button';
import { InfoTip } from './components/common';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './components/ui/dialog';
import Builder from './pages/Builder';
import Portal from './pages/Portal';
import CollaborativePortal from './pages/CollaborativePortal';
import {useWorks} from './work-store';
import {canSeeWorkItem,taskReadiness} from './work-model';
import Management from './pages/Management';
import Skills from './pages/Skills';
import Governance from './pages/Governance';
import {getGovernanceIssues} from './governance';
import { useDemo } from './store';
import type { Workspace } from './model';

const identities = [
 { id:'builder' as const, label:'Builder', icon:Hammer },
 { id:'portal' as const, label:'User Portal', icon:Compass },
 { id:'management' as const, label:'Manager', icon:ShieldCheck },
];
const navigation={builder:[{title:'构建与交付',items:[['agents','我的 Agents',LayoutGrid],['tests','测试与评估',FlaskConical],['releases','版本与发布',GitBranch]]},{title:'共享能力',items:[['knowledge','知识与上下文',Database],['tools','工具与连接',Wrench],['skills','Skill',Puzzle]]}],portal:[{title:'协作',items:[['tasks','任务',ListTodo],['inbox','待我处理',CheckCircle2]]},{title:'发现',items:[['catalog','Agent 与团队',Compass],['skills','Skill',Puzzle]]}],management:[{title:'管理与治理',items:[['overview','运营概览',Activity],['registry','注册与生命周期',Network],['approvals','发布与审批',GitBranch],['access','组织与访问',Users]]},{title:'共享能力',items:[['resources','共享资源',Database],['policies','安全与策略',SlidersHorizontal]]},{title:'证据与反馈',items:[['feedback','质量与反馈',MessageSquareText],['audit','审计记录',ScrollText]]}]};
const defaults={builder:'agents',portal:'tasks',management:'overview'};
function parseRoute(){const p=location.hash.slice(1).split('/');const workspace=(['builder','portal','management'].includes(p[0])?p[0]:'builder') as Workspace;return {workspace,page:p[1]||defaults[workspace],id:p[2]||undefined};}
export default function App(){
 const {state,notice,reset}=useDemo();
 const works=useWorks();
 const workPending=works.state.works.filter(w=>w.members.some(m=>m.personId===works.actorId)).reduce((n,w)=>n+w.decisions.filter(d=>d.status==='pending'&&d.approverId===works.actorId&&canSeeWorkItem(w,works.actorId,d)).length+w.subtasks.filter(t=>t.assigneeId===works.actorId&&(t.status!=='done'||taskReadiness(w,t)==='outdated')&&t.goalRevision===w.goalRevision&&canSeeWorkItem(w,works.actorId,t)).length+(w.ownerId===works.actorId&&w.artifacts.some(a=>a.status==='review'&&a.goalRevision===w.goalRevision&&canSeeWorkItem(w,works.actorId,a))?1:0),0);
 const [route,setRoute]=useState(parseRoute);
 const [collapsed,setCollapsed]=useState(false);
 const [mobile,setMobile]=useState(false);
 const [help,setHelp]=useState(false);
 const [resetOpen,setResetOpen]=useState(false);
 const [scope,setScope]=useState(false);
 const [notifications,setNotifications]=useState(false);
 const navigate=(workspace:Workspace,page:string,id?:string)=>{setRoute({workspace,page,id});location.hash=[workspace,page,id].filter(Boolean).join('/');setMobile(false);window.scrollTo(0,0);};
 useEffect(()=>{const fn=()=>setRoute(parseRoute());window.addEventListener('hashchange',fn);return()=>window.removeEventListener('hashchange',fn);},[]);
 const identity=identities.find(w=>w.id===route.workspace)!;
 const groups=navigation[route.workspace];
 const pageName=groups.flatMap(g=>g.items).find(i=>i[0]===route.page)?.[1]||(['editor','governance'].includes(route.page)?'Agent 配置':route.page==='run'?'执行详情':route.page==='work'?'协作任务':identity.label);
 const governancePending=getGovernanceIssues(state).filter(i=>i.status!=='resolved').length;
 const count=state.approvals.filter(a=>a.status==='pending').length;
 const waiting=state.runs.filter(r=>r.status==='waiting').length;
 return <div className={`app ${collapsed?'sidebar-collapsed':''} ${mobile?'mobile-open':''}`}>
  {mobile&&<button className="sidebar-backdrop" onClick={()=>setMobile(false)} aria-label="关闭导航"/>}
  <aside className="sidebar">
   <div className="brand"><div className="brand-mark"><Boxes size={23} strokeWidth={1.6}/></div>{!collapsed&&<span>Agent Wizard</span>}<button className="mobile-close" onClick={()=>setMobile(false)} aria-label="关闭导航"><X size={18}/></button></div>
   <button className="project-switch" aria-label="当前项目：企业智能助手" onClick={()=>setScope(true)}><div className="project-icon"><Building2 size={18}/></div>{!collapsed&&<><span><strong>企业智能助手</strong></span><ChevronsUpDown size={14}/></>}</button>
   <nav aria-label={`${identity.label}导航`}>{groups.map(group=><div className="nav-group" key={group.title}>{!collapsed&&<div className="nav-heading">{group.title}</div>}{group.items.map(([id,label,Icon])=>{const active=route.page===id||(id==='agents'&&['editor','governance'].includes(route.page))||(id==='tasks'&&['work','run'].includes(route.page));return <button aria-label={String(label)} aria-current={active?'page':undefined} title={collapsed?String(label):undefined} key={String(id)} className={`nav-item ${active?'active':''}`} onClick={()=>navigate(route.workspace,String(id))}><Icon size={17} strokeWidth={1.7}/>{!collapsed&&<><span>{String(label)}</span>{id==='approvals'&&count>0&&<em>{count}</em>}{id==='inbox'&&workPending>0&&<em>{workPending}</em>}{id==='policies'&&governancePending>0&&<em>{governancePending}</em>}</>}</button>;})}</div>)}</nav>
   <div className="identity-area">
    <DropdownMenu.Root>
     <DropdownMenu.Trigger asChild><button className="identity-switch" aria-label={`切换身份，当前 ${identity.label}`} title={collapsed?`切换身份：${identity.label}`:undefined}><span className="identity-avatar"><identity.icon size={18} strokeWidth={1.7}/></span>{!collapsed&&<><span className="identity-current"><strong>{identity.label}</strong><small>黄小明</small></span><ChevronsUpDown size={15}/></>}</button></DropdownMenu.Trigger>
     <DropdownMenu.Portal><DropdownMenu.Content className="identity-menu" side="top" align="start" sideOffset={10} collisionPadding={12}>
      <DropdownMenu.RadioGroup value={route.workspace} onValueChange={value=>{if(value!==route.workspace)navigate(value as Workspace,defaults[value as Workspace]);}} aria-label="选择身份">
       {identities.map(item=><DropdownMenu.RadioItem key={item.id} value={item.id} className="identity-menu-item"><item.icon size={17} strokeWidth={1.7}/><span>{item.label}</span><DropdownMenu.ItemIndicator><Check size={16}/></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem>)}
      </DropdownMenu.RadioGroup>
      <DropdownMenu.Separator className="identity-menu-separator"/>
      <DropdownMenu.Item className="identity-menu-item identity-reset" onSelect={()=>setResetOpen(true)}><RotateCcw size={15}/><span>重置演示数据</span></DropdownMenu.Item>
     </DropdownMenu.Content></DropdownMenu.Portal>
    </DropdownMenu.Root>
   </div>
  </aside>
  <div className="app-main">
   <header className="topbar"><div className="topbar-left"><button className="collapse-button desktop-collapse" onClick={()=>setCollapsed(!collapsed)} aria-label={collapsed?'展开导航':'折叠导航'}>{collapsed?<PanelLeftOpen size={18}/>:<PanelLeftClose size={18}/>}</button><button className="collapse-button mobile-menu" onClick={()=>setMobile(true)} aria-label="打开导航"><Menu size={19}/></button><div className="breadcrumbs"><span>企业智能助手</span><ChevronRight size={13}/><strong>{String(pageName)}</strong></div></div><div className="topbar-right"><span className="demo-indicator">Demo<InfoTip label="演示范围">纯前端演示，数据保存在当前浏览器。模型、部署、权限与企业系统均为模拟。</InfoTip></span><span className="topbar-divider"/><Button variant="ghost" size="icon-sm" aria-label="通知与待办" onClick={()=>setNotifications(true)} className="notification-button"><Bell size={17}/>{count+waiting+workPending+(route.workspace!=='portal'?governancePending:0)>0&&<i/>}</Button><Button variant="ghost" size="icon-sm" aria-label="演示信息" onClick={()=>setHelp(true)}><CircleHelp size={17}/></Button></div></header>
   <main key={route.workspace} className="main-content" aria-label={String(pageName)}>{route.page==='skills'&&route.workspace!=='management'?<Skills workspace={route.workspace} selectedId={route.id} onNavigate={navigate}/>:route.workspace==='builder'?<Builder page={route.page} selectedId={route.id} onNavigate={navigate}/>:route.workspace==='portal'?(['run','runs'].includes(route.page)?<Portal page={route.page==='runs'?'tasks':route.page} selectedId={route.id} onNavigate={navigate}/>:<CollaborativePortal page={route.page} selectedId={route.id} onNavigate={navigate}/>):route.page==='policies'?<Governance page={route.page} selectedId={route.id} onNavigate={navigate}/>:<Management page={route.page} selectedId={route.id} onNavigate={navigate}/>}</main>
  </div>
  {notice&&<div className="toast" role="status"><CheckCircle2 size={19}/><span>{notice}</span></div>}
  <Dialog open={help} onOpenChange={setHelp}><DialogContent><DialogHeader><DialogTitle>演示信息</DialogTitle><DialogDescription>Agent Wizard · PRD v0.3</DialogDescription></DialogHeader><div className="dialog-body"><p className="muted">数据保存在当前浏览器。身份、模型、部署与企业系统为模拟。视觉与基础组件源自 AgentEval v0.2.23。</p></div><DialogFooter><Button onClick={()=>setHelp(false)}>关闭</Button></DialogFooter></DialogContent></Dialog>
  <Dialog open={resetOpen} onOpenChange={setResetOpen}><DialogContent><DialogHeader><DialogTitle>重置演示数据？</DialogTitle><DialogDescription>当前浏览器中创建的草稿、任务、审批和反馈将被初始示例替换，无法恢复。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={()=>setResetOpen(false)}>取消</Button><Button variant="destructive" onClick={()=>{reset();works.resetWorks();setResetOpen(false);navigate(route.workspace,defaults[route.workspace]);}}>重置数据</Button></DialogFooter></DialogContent></Dialog>
  <Dialog open={scope} onOpenChange={setScope}><DialogContent aria-describedby={undefined}><DialogHeader><DialogTitle>企业智能助手</DialogTitle></DialogHeader><div className="dialog-body"><div className="scope-path"><span>企业空间</span><ChevronRight size={14}/><span>数字化创新</span><ChevronRight size={14}/><strong>企业智能助手</strong></div></div><DialogFooter><Button onClick={()=>setScope(false)}>关闭</Button></DialogFooter></DialogContent></Dialog>
  <Dialog open={notifications} onOpenChange={setNotifications}><DialogContent aria-describedby={undefined}><DialogHeader><DialogTitle>待办</DialogTitle></DialogHeader><div className="dialog-body notification-list">{route.workspace!=='portal'&&<button onClick={()=>{setNotifications(false);navigate('management','policies');}}><ShieldCheck/><span><strong>防护与整改</strong></span><b>{governancePending}</b><ChevronRight/></button>}<button onClick={()=>{setNotifications(false);navigate('management','approvals');}}><GitBranch/><span><strong>发布与访问审批</strong></span><b>{count}</b><ChevronRight/></button><button onClick={()=>{setNotifications(false);navigate('portal','inbox');}}><ListTodo/><span><strong>协作待办</strong></span><b>{workPending}</b><ChevronRight/></button>{waiting>0&&<button onClick={()=>{setNotifications(false);navigate('portal','runs');}}><CheckCircle2/><span><strong>执行确认</strong></span><b>{waiting}</b><ChevronRight/></button>}</div></DialogContent></Dialog>
 </div>;
}
