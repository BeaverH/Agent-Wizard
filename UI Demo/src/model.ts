import {initialSkills, type SkillSnapshot} from './skill-model.ts';
import type { GovernanceState, Capability } from './governance';
export type Workspace = 'builder' | 'portal' | 'management';
export type VersionStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'delivered';
export type RunStatus = 'queued' | 'running' | 'waiting' | 'success' | 'failed' | 'blocked' | 'cancelled' | 'timeout';
export interface TestEvidence { revision:number; input:string; result:'pass'|'fail'; method:string }
export interface Version { skillSnapshots?:SkillSnapshot[]; version:string; revision:number; releaseId:string; name:string; instructions:string; model:string; knowledge:string[]; tools:string[]; skills:string[]; createdAt:string; evidence?:TestEvidence }
export interface Agent { id:string; name:string; description:string; category:string; icon:string; owner:string; updatedAt:string; model:string; instructions:string; knowledge:string[]; tools:string[]; skills:string[]; revision:number; testedRevision:number|null; testResult:'pass'|'fail'|null; testInput:string; status:VersionStatus; activeVersion:string|null; deployment:'none'|'available'|'failed'|'stopped'; catalog:'listed'|'unlisted'; access:'granted'|'none'|'pending'|'revoked'; enabled:boolean; versions:Version[]; nextVersion:string; reviewNote?:string }
export interface Resource { id:string; name:string; kind:'model'|'knowledge'|'tool'|'skill'; version?:string; category?:string; instructions?:string; input?:string; output?:string; tags?:string[]; owner:string; status:'available'|'unauthorized'|'offline'; scope:string; detail:string }
export interface Approval { id:string; type:'release'|'access'; agentId:string; revision:number; version:string; status:'pending'|'approved'|'rejected'; purpose:string; createdAt:string; note?:string; evidence?:TestEvidence }
export interface Run { capability?:Capability; subtaskInputs?:{subtaskId:string;resultId:string;version:number;title?:string}[];sourceSeq?:number;workId?:string;conversationId?:string; goalRevision?:number; subtaskId?:string; initiatorId?:string; initiatorName?:string; id:string; agentId:string; version:string; releaseId:string; deploymentId:string; sessionId:string; input:string; status:RunStatus; result:string; reason:string; createdAt:string; events:{label:string; time:string}[]; confirmed:boolean; scenario:'normal'|'approval'|'failure'|'guardrail'|'timeout' }
export interface Feedback { id:string; runId:string; version:string; agentId:string; category:string; text:string; status:'open'|'resolved'; createdAt:string }
export interface Audit { id:string; action:string; target:string; actor:string; createdAt:string; result:string }
export interface DemoState { governance?:GovernanceState; agents:Agent[]; resources:Resource[]; approvals:Approval[]; runs:Run[]; feedback:Feedback[]; audit:Audit[] }
export const now = () => new Date().toLocaleString('zh-CN',{hour12:false});
export const uid = (prefix:string) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
const initialReleaseIds:Record<string,string>={'采购申请助手':'REL-001','企业知识助手':'REL-KNOWLEDGE-001','合同审阅助手':'REL-CONTRACT-001','IT 服务助手':'REL-IT-001'};
const version = (v:string,rev:number,name:string):Version => ({version:v,revision:rev,releaseId:initialReleaseIds[name]||`REL-${name}-${v}`,name,instructions:'根据企业制度回答问题，引用来源；涉及实际业务操作时先获得用户确认。',model:'GPT-4.1',knowledge:['kb-procurement'],tools:['tool-purchase'],skills:[],createdAt:'2026/11/02 14:30:00',evidence:{revision:rev,input:name==='企业知识助手'?'出差报销需要准备哪些材料？':'验证 '+name+' 的基础任务与引用。',result:'pass',method:'单次示例输入 · 模拟结果'}});
const base = {owner:'黄小明',updatedAt:'今天 14:32',model:'GPT-4.1',instructions:'你是企业采购助手。依据采购管理制度帮助员工整理采购需求、核对预算与审批路径。\n\n回答必须引用制度来源；缺少信息时先追问。创建采购申请前，向用户展示摘要并请求确认。不要代替用户完成未经确认的业务操作。',knowledge:['kb-procurement'],tools:['tool-purchase'],skills:[],revision:4,testedRevision:4,testResult:'pass' as const,testInput:'采购 3 台笔记本电脑，预算 24,000 元，需要走什么流程？',status:'delivered' as VersionStatus,activeVersion:'v1.2.0',deployment:'available' as const,catalog:'listed' as const,access:'granted' as const,enabled:true,nextVersion:'v1.3.0'};
export const initialState:DemoState = {
 agents:[
  {...base,id:'AGT-007',name:'经营分析专家',description:'分析经营数据、识别变化与风险，形成可核验的结论。',category:'数据分析',icon:'insight',knowledge:['kb-handbook'],tools:[],instructions:'根据任务共享资料进行经营分析，标注来源与待确认假设。',activeVersion:'v1.0.0',nextVersion:'v1.1.0',versions:[{...version('v1.0.0',4,'经营分析专家'),releaseId:'REL-ANALYSIS-001',knowledge:['kb-handbook'],tools:[]}]},
  {...base,id:'AGT-008',name:'报告撰写专家',description:'整合资料与分析，编写结构清楚的经营汇报。',category:'内容协作',icon:'report',knowledge:['kb-handbook'],tools:[],instructions:'根据已确认目标、分析和引用撰写报告，不将个人建议当作确认事实。',activeVersion:'v1.0.0',nextVersion:'v1.1.0',versions:[{...version('v1.0.0',4,'报告撰写专家'),releaseId:'REL-WRITING-001',knowledge:['kb-handbook'],tools:[]}]},
  {...base,id:'AGT-001',name:'采购申请助手',description:'从采购需求到申请草稿，协助核对制度、预算与审批流程。',category:'业务协作',icon:'purchase',versions:[version('v1.2.0',4,'采购申请助手')]},
  {...base,id:'AGT-002',name:'企业知识助手',description:'检索企业知识与内部文档，让每个回答都有可靠依据。',category:'知识问答',icon:'knowledge',knowledge:['kb-handbook'],tools:[],nextVersion:'v2.1.0',activeVersion:'v2.0.0',versions:[{...version('v2.0.0',4,'企业知识助手'),knowledge:['kb-handbook'],tools:[]}]},
  {...base,id:'AGT-003',name:'合同审阅助手',description:'识别合同关键条款与潜在风险，辅助法务进行初步审阅。',category:'专业服务',icon:'contract',owner:'林知夏',access:'none',activeVersion:'v1.0.0',nextVersion:'v1.1.0',versions:[version('v1.0.0',4,'合同审阅助手')]},
  {...base,id:'AGT-004',name:'客户洞察助手',description:'整理客户反馈与服务记录，生成清晰的洞察摘要。',category:'数据分析',icon:'insight',revision:2,testedRevision:null,testResult:null,status:'draft',activeVersion:null,nextVersion:'v0.1.0',deployment:'none',catalog:'unlisted',tools:[],versions:[]},
  {...base,id:'AGT-005',name:'周报整理助手',description:'汇总项目进展、待办与风险，快速形成结构化周报。',category:'办公效率',icon:'report',owner:'陈一舟',status:'pending',activeVersion:null,nextVersion:'v1.0.0',deployment:'none',catalog:'unlisted',testInput:'汇总本周项目进展，生成周报草稿。',versions:[]},
  {...base,id:'AGT-006',name:'IT 服务助手',description:'定位常见 IT 问题，指导排障并生成服务工单。',category:'业务协作',icon:'service',activeVersion:'v1.1.0',nextVersion:'v1.2.0',deployment:'stopped',enabled:false,versions:[version('v1.1.0',4,'IT 服务助手')]},
 ],
 resources:[
  ...initialSkills,
  {id:'model-gpt',name:'GPT-4.1',kind:'model',owner:'平台团队',status:'available',scope:'企业共享',detail:'通用文本与推理 · 受控模型引用'},
  {id:'model-qwen',name:'Qwen3',kind:'model',owner:'平台团队',status:'available',scope:'企业共享',detail:'企业内网模型 · 受控模型引用'},
  {id:'kb-procurement',name:'采购管理制度',kind:'knowledge',owner:'采购运营',status:'available',scope:'数字化创新 / 本项目',detail:'12 份文档 · 示例修订 2026.10'},
  {id:'kb-handbook',name:'员工知识手册',kind:'knowledge',owner:'人力资源',status:'available',scope:'企业共享',detail:'38 份文档 · 示例修订 2026.10'},
  {id:'kb-finance',name:'财务保密资料',kind:'knowledge',owner:'财务管理',status:'unauthorized',scope:'仅财务项目',detail:'当前项目未获授权，不能绑定'},
  {id:'kb-old',name:'历史供应商资料',kind:'knowledge',owner:'采购运营',status:'offline',scope:'本项目',detail:'连接不可用，请联系 Owner'},
  {id:'tool-purchase',name:'采购申请服务',kind:'tool',owner:'采购运营',status:'available',scope:'本项目',detail:'创建采购申请草稿 · 执行前需人工确认'},
  {id:'tool-search',name:'企业文档检索',kind:'tool',owner:'平台团队',status:'available',scope:'企业共享',detail:'只读检索 · 继承知识访问范围'},
  {id:'tool-payment',name:'财务付款服务',kind:'tool',owner:'财务管理',status:'unauthorized',scope:'仅财务项目',detail:'敏感业务操作 · 未获授权'},
 ],
 approvals:[{id:'APR-1001',type:'release',agentId:'AGT-005',revision:4,version:'v1.0.0',status:'pending',purpose:'周报整理助手首个正式版本，目标环境：生产。',createdAt:'2026/11/03 10:20:00',evidence:{revision:4,input:'汇总本周项目进展，生成周报草稿。',result:'pass',method:'单次示例输入 · 模拟结果'}}],
 runs:[
  {id:'RUN-1028',agentId:'AGT-001',version:'v1.2.0',releaseId:'REL-001',deploymentId:'DEP-AGT-001',sessionId:'SES-1028',input:'采购 3 台笔记本电脑，预算 24,000 元，需要走什么流程？',status:'success',result:'已为你整理采购申请建议。\n\n1. 需求说明：3 台办公笔记本电脑，预算合计 ¥24,000。\n2. 审批路径：部门负责人 → 预算负责人 → 采购部门。\n3. 所需材料：采购用途说明、设备配置清单、预算归属。\n\n依据《采购管理制度》第 3.2 节，此项申请需先完成预算确认。本次仅整理建议，未创建采购单。',reason:'',createdAt:'2026/11/03 14:20:00',events:[{label:'访问权限校验通过',time:'14:20:00'},{label:'知识检索：采购管理制度',time:'14:20:01'},{label:'输出检查通过，任务完成',time:'14:20:03'}],confirmed:false,scenario:'normal'},
  {id:'RUN-1027',agentId:'AGT-002',version:'v2.0.0',releaseId:'REL-KNOWLEDGE-001',deploymentId:'DEP-AGT-002',sessionId:'SES-1027',input:'出差报销需要准备哪些材料？',status:'success',result:'根据员工知识手册，请准备出差审批单、行程与票据，并按适用流程提交。以上为演示回答。',reason:'',createdAt:'2026/11/03 11:08:00',events:[{label:'任务完成',time:'11:08:03'}],confirmed:false,scenario:'normal'},
  {id:'RUN-1026',agentId:'AGT-001',version:'v1.2.0',releaseId:'REL-001',deploymentId:'DEP-AGT-001',sessionId:'SES-1026',input:'获取供应商最新报价。',status:'failed',result:'',reason:'采购申请服务连接超时，未执行外部业务操作。请联系资源 Owner 确认连接状态。',createdAt:'2026/11/03 09:42:00',events:[{label:'工具调用超时',time:'09:42:30'}],confirmed:false,scenario:'failure'}
 ],
 feedback:[{id:'FB-001',runId:'RUN-1026',agentId:'AGT-001',version:'v1.2.0',category:'运行问题',text:'获取供应商报价时连接超时，请协助定位。',status:'open',createdAt:'2026/11/03 09:45:00'}],
 audit:[{id:'AUD-001',action:'部署并上架',target:'采购申请助手 · v1.2.0',actor:'黄小明',createdAt:'2026/11/02 14:30:00',result:'成功'},{id:'AUD-002',action:'提交发布审批',target:'周报整理助手 · v1.0.0',actor:'陈一舟',createdAt:'2026/11/03 10:20:00',result:'待审'}]
};
export const labels:Record<string,string> = {draft:'草稿',pending:'待审批',approved:'已批准',rejected:'已驳回',delivered:'已交付',none:'未部署',available:'可用',failed:'失败',stopped:'已停用',listed:'已上架',unlisted:'未上架',granted:'已授权',revoked:'已撤权',queued:'排队中',running:'执行中',waiting:'等待人工确认',success:'已完成',blocked:'已拦截',cancelled:'已取消',timeout:'已超时',pass:'验证通过',fail:'验证失败',open:'待处理',resolved:'已处理',unauthorized:'未授权',offline:'连接异常'};
