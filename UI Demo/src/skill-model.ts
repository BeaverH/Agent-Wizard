import type { Agent, DemoState, Resource } from './model';

export interface SkillSnapshot {id:string;name:string;version:string;instructions:string}

export const initialSkills:Resource[]=[
 {id:'skill-procurement',name:'采购需求核对',kind:'skill',version:'1.0.0',category:'业务协作',owner:'采购运营',status:'available',scope:'本项目',detail:'核对采购用途、预算与审批材料，整理待补充事项。',input:'采购需求、预算和制度依据',output:'需求核对清单与待确认项',tags:['采购','需求核对'],instructions:'读取获授权的采购需求与制度依据；逐项核对用途、预算、数量和审批材料。缺少信息时列出待确认事项。仅生成建议，不创建或提交采购单。'},
 {id:'skill-meeting',name:'会议纪要整理',kind:'skill',version:'1.2.0',category:'办公效率',owner:'协作平台',status:'available',scope:'企业共享',detail:'从会议记录中整理议题、已确认结论和行动项。',input:'已授权的会议记录或讨论材料',output:'会议纪要、行动项与待确认问题',tags:['会议','内容整理'],instructions:'按议题整理用户提供的记录，标注已确认结论与讨论建议；仅在原文有依据时记录行动项、负责人和期限，不补写不存在的决策。'},
 {id:'skill-report',name:'报告结构整理',kind:'skill',version:'1.0.0',category:'内容协作',owner:'平台团队',status:'available',scope:'企业共享',detail:'将已有材料组织为报告提纲，保留引用与待核验信息。',input:'任务目标、资料与已有分析',output:'报告提纲、材料引用及待核验清单',tags:['报告','结构化输出'],instructions:'围绕任务目标整理已有资料，形成提纲和章节依据。区分事实、分析与建议；保留引用来源，不将缺失信息编写为确定结论。'},
 {id:'skill-finance',name:'财务报表解读',kind:'skill',version:'0.9.0',category:'数据分析',owner:'财务管理',status:'unauthorized',scope:'仅财务项目',detail:'解读获授权报表中的科目和变化，当前项目尚未获准使用。',input:'获授权的财务报表',output:'科目说明与变化分析',tags:['财务','受限'],instructions:'仅处理当前项目获授权的报表；引用报表科目与期间，缺失口径时请求确认。'},
 {id:'skill-document',name:'旧版文档解析',kind:'skill',version:'0.8.0',category:'知识问答',owner:'知识平台',status:'offline',scope:'本项目',detail:'提取文档结构与引用位置，当前版本已停用。',input:'已授权的文档',output:'结构化摘录和出处',tags:['文档','解析'],instructions:'根据文档提取标题、条目与引用位置。'},
];

export function migrateSkillState(state:DemoState):DemoState{
 return {...state,resources:[...state.resources,...structuredClone(initialSkills.filter(s=>!state.resources.some(r=>r.id===s.id)))],agents:state.agents.map(a=>({...a,skills:Array.isArray(a.skills)?[...a.skills]:[],versions:a.versions.map(v=>({...v,skills:Array.isArray(v.skills)?[...v.skills]:[]}))}))};
}

export function skillBindingError(state:DemoState,ids:string[]):string|null{
 for(const id of ids){const skill=state.resources.find(r=>r.id===id);if(!skill||skill.kind!=='skill')return '包含不存在的 Skill，请移除后重试。';if(skill.status!=='available')return '包含未授权或已停用的 Skill，请移除后重试。';}
 return null;
}

export function getPublishedSkillAgents(state:DemoState,skillId:string):Agent[]{
 return state.agents.filter(a=>a.catalog==='listed'&&!!a.activeVersion&&a.versions.some(v=>v.version===a.activeVersion&&(v.skills??[]).includes(skillId)));
}

export function skillExecutionGate(state:DemoState,agentId:string,releaseId?:string):{allowed:boolean;reason:string}{
 const a=state.agents.find(a=>a.id===agentId);const version=a?.versions.find(v=>releaseId?v.releaseId===releaseId:v.version===a.activeVersion);
 if(!a||!version)return {allowed:false,reason:'尚无可用的 Agent 运行版本。'};
 const error=skillBindingError(state,version.skills??[]);
 return error?{allowed:false,reason:'该 Agent 的 Skill 暂不可用，请联系负责人。'}:{allowed:true,reason:''};
}

export function snapshotSkills(state:DemoState,ids:string[]):SkillSnapshot[]{
 const error=skillBindingError(state,ids);if(error)throw new Error(error);
 return ids.map(id=>{const r=state.resources.find(r=>r.id===id)!;return {id:r.id,name:r.name,version:r.version??'未知',instructions:r.instructions??''};});
}
