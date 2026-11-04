import assert from 'node:assert/strict';
import { initialState } from '../src/model.ts';
import { initialSkills, migrateSkillState, skillBindingError, getPublishedSkillAgents, skillExecutionGate, snapshotSkills } from '../src/skill-model.ts';

let assertions=0;
const equal=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);assertions++;};
const ok=(value,message)=>{assert.ok(value,message);assertions++;};
const fixture=()=>structuredClone(initialState);
const available=initialSkills.find(skill=>skill.status==='available');
const restricted=initialSkills.find(skill=>skill.status==='unauthorized');
const stopped=initialSkills.find(skill=>skill.status==='offline');

// Upgrade older saved data without inventing historical Skill bindings or replacing edits.
const legacy=fixture();
legacy.resources=legacy.resources.filter(resource=>resource.kind!=='skill');
legacy.resources.push({id:'custom-tool',name:'自建工具',kind:'tool',owner:'用户',status:'available',scope:'本项目',detail:'保留自建资源'});
for(const agent of legacy.agents){delete agent.skills;for(const version of agent.versions)delete version.skills;}
const before=structuredClone(legacy);
const migrated=migrateSkillState(legacy);
equal(legacy,before,'Migration does not mutate saved data.');
equal(migrated.resources.filter(resource=>resource.kind==='skill').map(resource=>resource.id),initialSkills.map(skill=>skill.id));
ok(migrated.resources.some(resource=>resource.id==='custom-tool'),'Custom resources survive migration.');
ok(migrated.agents.every(agent=>Array.isArray(agent.skills)&&agent.skills.length===0));
ok(migrated.agents.every(agent=>agent.versions.every(version=>Array.isArray(version.skills)&&version.skills.length===0)),'Old releases must not acquire bindings retroactively.');
ok(migrated.agents.every(agent=>agent.versions.every(version=>version.skillSnapshots===undefined)),'Migration must not fabricate historical instruction snapshots.');
equal(migrateSkillState(migrated),migrated,'Migration is idempotent.');
equal(new Set(migrated.resources.map(resource=>resource.id)).size,migrated.resources.length);

const saved=fixture();
saved.resources.find(resource=>resource.id===available.id).detail='用户维护的说明';
saved.resources.find(resource=>resource.id===available.id).version='5.4.3';
saved.agents[0].skills=[available.id];
saved.agents[0].versions[0].skills=[restricted.id];
const updated=migrateSkillState(saved);
equal(updated.resources.find(resource=>resource.id===available.id).detail,'用户维护的说明');
equal(updated.resources.find(resource=>resource.id===available.id).version,'5.4.3');
equal(updated.agents[0].skills,[available.id]);
equal(updated.agents[0].versions[0].skills,[restricted.id]);
ok(updated.agents[0].skills!==saved.agents[0].skills);
ok(updated.agents[0].versions[0].skills!==saved.agents[0].versions[0].skills);
updated.agents[0].skills.push(stopped.id);
equal(saved.agents[0].skills,[available.id],'Draft references are copied.');
equal(updated.agents[0].versions[0].skills,[restricted.id],'Changing a draft does not rewrite a release.');

const malformed=fixture();malformed.agents[0].skills='invalid';malformed.agents[0].versions[0].skills=null;
const repaired=migrateSkillState(malformed);
equal(repaired.agents[0].skills,[]);
equal(repaired.agents[0].versions[0].skills,[]);

// Each migrated browser state receives its own newly introduced seed resources.
const isolatedA=migrateSkillState(legacy);const isolatedB=migrateSkillState(legacy);
const originalSeedDetail=available.detail;
isolatedA.resources.find(resource=>resource.id===available.id).detail='仅 A 修改';
equal(isolatedB.resources.find(resource=>resource.id===available.id).detail,originalSeedDetail,'Seed resources must not alias across migrated states.');

// Binding checks validate resource type and current availability, not only an ID's existence.
const state=fixture();
equal(skillBindingError(state,[]),null);
equal(skillBindingError(state,[available.id]),null);
ok(skillBindingError(state,[restricted.id]));
ok(skillBindingError(state,[stopped.id]));
ok(skillBindingError(state,['does-not-exist']));
ok(skillBindingError(state,[state.resources.find(resource=>resource.kind==='tool').id]));
ok(skillBindingError(state,[available.id,restricted.id]));
const newlyUnavailable=fixture();newlyUnavailable.resources.find(resource=>resource.id===available.id).status='offline';
ok(skillBindingError(newlyUnavailable,[available.id]),'Recheck availability after an earlier successful binding.');

// Discovery follows the active delivered snapshot, even while a new draft is being edited.
const catalog=fixture();const agent=catalog.agents.find(item=>item.id==='AGT-001');
agent.skills=[available.id];
equal(getPublishedSkillAgents(catalog,available.id).map(item=>item.id),[],'Draft-only Skill bindings are not published.');
const release=agent.versions.find(version=>version.version===agent.activeVersion);
release.skills=[available.id];
equal(getPublishedSkillAgents(catalog,available.id).map(item=>item.id),[agent.id]);
agent.skills=[];
equal(getPublishedSkillAgents(catalog,available.id).map(item=>item.id),[agent.id],'Draft removal leaves the current published binding intact.');
agent.versions.push({...structuredClone(release),version:'v0.8.0',releaseId:'REL-SKILL-OLD',skills:[restricted.id]});
equal(getPublishedSkillAgents(catalog,restricted.id).map(item=>item.id),[],'Inactive releases do not appear as current Skill executors.');
agent.catalog='unlisted';
equal(getPublishedSkillAgents(catalog,available.id).map(item=>item.id),[]);
agent.catalog='listed';agent.activeVersion=null;
equal(getPublishedSkillAgents(catalog,available.id).map(item=>item.id),[]);

// Execution checks use the requested frozen Release, not the Agent's current draft.
const execution=fixture();const executor=execution.agents.find(item=>item.id==='AGT-001');
const active=executor.versions.find(version=>version.version===executor.activeVersion);
executor.skills=[restricted.id];active.skills=[available.id];
equal(skillExecutionGate(execution,executor.id).allowed,true);
active.skills=[restricted.id];
equal(skillExecutionGate(execution,executor.id).allowed,false);
active.skills=[stopped.id];
equal(skillExecutionGate(execution,executor.id).allowed,false);
active.skills=['removed-skill'];
equal(skillExecutionGate(execution,executor.id).allowed,false);
active.skills=[execution.resources.find(resource=>resource.kind==='tool').id];
equal(skillExecutionGate(execution,executor.id).allowed,false);
active.skills=[];
equal(skillExecutionGate(execution,executor.id).allowed,true,'A release without Skills remains executable under this resource check.');
executor.versions.push({...structuredClone(active),version:'v0.7.0',releaseId:'REL-FROZEN-RESTRICTED',skills:[restricted.id]});
equal(skillExecutionGate(execution,executor.id,'REL-FROZEN-RESTRICTED').allowed,false);
equal(skillExecutionGate(execution,executor.id,active.releaseId).allowed,true);
equal(skillExecutionGate(execution,'unknown-agent').allowed,false);
equal(skillExecutionGate(execution,executor.id,'unknown-release').allowed,false);
const draft=execution.agents.find(item=>!item.activeVersion);
equal(skillExecutionGate(execution,draft.id).allowed,false);
const denied=skillExecutionGate(execution,executor.id,'REL-FROZEN-RESTRICTED');
ok(denied.reason.includes('Skill'));
ok(!denied.reason.includes(restricted.instructions),'User-facing denial must not expose Skill instructions.');

// Published instructions and Skill versions remain stable when a shared definition later changes.
const definitions=fixture();
const definition=definitions.resources.find(resource=>resource.id===available.id);
const frozen=snapshotSkills(definitions,[available.id]);
equal(frozen,[{id:definition.id,name:definition.name,version:definition.version,instructions:definition.instructions}]);
const originalFrozen=structuredClone(frozen);
definition.name='新名称';definition.version='9.0.0';definition.instructions='新的共享指令';
equal(frozen,originalFrozen,'A later shared edit cannot rewrite an earlier release snapshot.');
const another=snapshotSkills(definitions,[available.id]);
ok(another[0]!==frozen[0]);
equal(another[0].version,'9.0.0');
equal(another[0].instructions,'新的共享指令');
const noVersion={...definition,id:'skill-no-version'};delete noVersion.version;delete noVersion.instructions;
definitions.resources.push(noVersion);
equal(snapshotSkills(definitions,[noVersion.id])[0].version,'未知','Missing historical version information is not invented.');
equal(snapshotSkills(definitions,[noVersion.id])[0].instructions,'');
for(const id of [restricted.id,stopped.id,'removed-skill',definitions.resources.find(resource=>resource.kind==='tool').id]){
 assert.throws(()=>snapshotSkills(definitions,[id]));assertions++;
}

console.log(`PASS: ${assertions} Skill assertions (migration, binding eligibility, published snapshots and frozen-release execution).`);
