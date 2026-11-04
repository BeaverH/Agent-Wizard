import assert from 'node:assert/strict';
import { initialState } from '../src/model.ts';
import {
  assessCandidate, candidateAssessment, deployGovernance, ensureGovernance,
  getAgentGovernance, getGovernanceIssues, governanceGate, governanceImpact,
  transitionGovernance,
} from '../src/governance.ts';

let checks=0;
const equal=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;};
const ok=(value,label)=>{assert.ok(value,label);checks++;};
const deny=(fn,label)=>{assert.throws(fn,undefined,label);checks++;};
const at='2026/11/04 15:00:00';
const fixture=()=>{const state=structuredClone(initialState);state.governance=ensureGovernance(state);return state;};
const agent=(state,id='AGT-001')=>state.agents.find(item=>item.id===id);
const view=(state,id='AGT-001',releaseId)=>getAgentGovernance(state,agent(state,id),releaseId);
const act=(state,action)=>transitionGovernance(state,action,at);
const simulate=(state,scenario,id='AGT-001',extra={})=>act(state,{type:'simulate',scenario,agentId:id,...extra});
const currentIssue=(state,id='AGT-001',kind)=>getGovernanceIssues(state).find(item=>item.agentId===id&&item.status!=='resolved'&&(!kind||item.kind===kind));
const step=(state,type,issueId=currentIssue(state).id)=>act(state,{type,issueId});
const recover=(state,issueId)=>['acknowledge','replace','retest','approve-recovery'].reduce((next,type)=>step(next,type,issueId),state);

// Existing assets migrate without changing their release/deployment/access axes.
let state=fixture();
equal(view(state).readiness,'ready','valid production release is Ready');
equal(view(state).risk,'low','risk comes from a matching assessment');
equal(view(state,'AGT-003').readiness,'limited','revoked action protection limits capabilities');
equal(governanceGate(state,'AGT-003','general').allowed,true,'limited Agent still permits queries');
equal(governanceGate(state,'AGT-003','protected-action').allowed,false,'limited Agent rejects business actions');
equal(view(state,'AGT-004').risk,'unknown','unassessed draft does not become low risk');
equal(view(state,'AGT-004').readiness,'not-ready','unpublished draft is not production Ready');
equal(governanceGate(state,'missing-agent').allowed,false,'unknown Agent fails closed');
equal(governanceGate(state,'AGT-001','general','missing-release').allowed,false,'unknown frozen release fails closed');
const snapshot=structuredClone(state);
ensureGovernance(state);
equal(state,snapshot,'reading governance does not mutate browser assets');

// A suspected false positive is an investigation, not an automatic suspension.
const beforeFeedback=structuredClone(view(state));
state=simulate(state,'false-positive','AGT-001',{sourceRunId:'RUN-FALSE-POSITIVE',description:'This allowed query was blocked.'});
let issue=currentIssue(state,'AGT-001','false-positive');
equal(issue.sourceRunId,'RUN-FALSE-POSITIVE','feedback keeps its exact Run reference');
equal(view(state).readiness,'ready','suspected false positive does not block Agent');
equal(view(state).risk,beforeFeedback.risk,'suspected false positive does not invent risk');
equal(view(state).bindings,beforeFeedback.bindings,'feedback does not alter policy bindings');
equal(view(state).assessment,beforeFeedback.assessment,'feedback does not rewrite assessment');
const count=getGovernanceIssues(state).length;
state=simulate(state,'false-positive','AGT-001',{sourceRunId:'RUN-FALSE-POSITIVE'});
equal(getGovernanceIssues(state).length,count,'repeated feedback event does not duplicate its open issue');
deny(()=>step(state,'approve-recovery',issue.id),'feedback cannot use recovery approval');
deny(()=>step(state,'dismiss-feedback',issue.id),'feedback requires response before closure');
state=step(state,'acknowledge',issue.id);
equal(view(state).readiness,'ready','acknowledging feedback keeps use available');
state=step(state,'dismiss-feedback',issue.id);
equal(getGovernanceIssues(state).find(item=>item.id===issue.id).status,'resolved','investigation can close feedback');
equal(view(state).assessment,beforeFeedback.assessment,'closing feedback is not a production policy change');
deny(()=>step(state,'dismiss-feedback',issue.id),'closed feedback cannot be processed twice');

// Optional protection restricts only protected actions, with no release-state rewrite.
state=fixture();
state=assessCandidate(state,agent(state),false,at);
equal(candidateAssessment(state,agent(state)).status,'passed','current candidate can be evaluated before a change');
const liveAgent=structuredClone(agent(state));
const original=structuredClone(state);
state=simulate(state,'revoke-action');
issue=currentIssue(state,'AGT-001','policy-revoked');
equal(original.governance.records.find(item=>item.releaseId===liveAgent.versions[0].releaseId).bindings.every(item=>item.status==='active'),true,'revocation leaves input snapshot untouched');
equal(view(state).readiness,'limited','action protection revocation produces Limited');
equal(governanceGate(state,'AGT-001','general').allowed,true,'general execution remains allowed');
equal(governanceGate(state,'AGT-001','protected-action').allowed,false,'protected execution is denied');
equal(agent(state).status,liveAgent.status,'governance does not rewrite delivered status');
equal(agent(state).deployment,liveAgent.deployment,'governance is independent of runtime deployment');
equal(agent(state).catalog,liveAgent.catalog,'governance restriction does not erase catalog state');
equal(agent(state).versions,liveAgent.versions,'release snapshots survive governance events');
equal(candidateAssessment(state,agent(state)).status,'pending','revocation invalidates a previously passed candidate');
deny(()=>deployGovernance(state,agent(state),'REL-BYPASS'),'stale candidate cannot be deployed');
state=assessCandidate(state,agent(state),false,at);
equal(candidateAssessment(state,agent(state)).status,'failed','validation cannot bypass an active protection gap');
deny(()=>step(state,'replace',issue.id),'must respond before preparing a replacement');
deny(()=>step(state,'retest',issue.id),'cannot test a nonexistent replacement');
deny(()=>step(state,'approve-recovery',issue.id),'cannot restore before repair and validation');
state=step(state,'acknowledge',issue.id);
equal(view(state).readiness,'limited','response is not restoration');
deny(()=>step(state,'dismiss-feedback',issue.id),'closing a feedback item cannot clear a protection issue');
state=step(state,'replace',issue.id);
equal(view(state).readiness,'limited','prepared replacement stays restricted until verified');
equal(view(state).bindings.find(item=>item.id===issue.bindingId).status,'pending','replacement is not active before approval');
ok(getGovernanceIssues(state).find(item=>item.id===issue.id).previousBinding,'original binding is retained as evidence');
deny(()=>step(state,'approve-recovery',issue.id),'replacement alone is insufficient for restoration');
state=step(state,'retest',issue.id);
equal(view(state).readiness,'limited','passing retest still waits for approval and deployment');
state=step(state,'approve-recovery',issue.id);
equal(view(state).readiness,'ready','completed recovery restores Ready');
equal(view(state).risk,'low','recovery records the new assessment');
equal(governanceGate(state,'AGT-001','protected-action').allowed,true,'protected action returns after verified recovery');
deny(()=>step(state,'approve-recovery',issue.id),'recovery is not executed twice');
state=assessCandidate(state,agent(state),false,at);
equal(candidateAssessment(state,agent(state)).status,'passed','candidate needs a fresh validation after protection recovery');

// A mandatory/shared protection failure blocks every affected production binding.
state=fixture();
const impacted=governanceImpact(state,'AGT-001',true);
ok(impacted.length>1,'shared policy has multiple Agent consumers');
const release=agent(state).versions.find(item=>item.version===agent(state).activeVersion).releaseId;
state=simulate(state,'revoke-shared');
for(const item of impacted){
 equal(view(state,item.id).readiness,'not-ready',`shared revocation blocks ${item.id}`);
 equal(governanceGate(state,item.id,'general').allowed,false,`new execution denied for ${item.id}`);
 equal(getGovernanceIssues(state).some(issue=>issue.agentId===item.id&&issue.kind==='policy-revoked'&&issue.status==='open'),true,`Manager receives affected Agent issue for ${item.id}`);
}
equal(governanceGate(state,'AGT-001','general',release).allowed,false,'frozen release is also denied');
equal(getGovernanceIssues(state).some(issue=>issue.agentId==='AGT-004'),false,'shared production event does not create issue on unpublished draft');
const issuesBefore=getGovernanceIssues(state).length;
state=simulate(state,'revoke-shared');
equal(getGovernanceIssues(state).length,issuesBefore,'repeat shared event is idempotent');

// Multiple outstanding causes must each clear; resolving one is not a blanket override.
state=fixture();
state=simulate(state,'revoke-action');
const actionIssue=currentIssue(state).id;
state=simulate(state,'critical');
const criticalIssue=currentIssue(state,'AGT-001','critical').id;
equal(view(state).readiness,'not-ready','confirmed critical finding blocks all execution');
equal(view(state).risk,'high','confirmed critical finding has an evidence-based high risk');
state=assessCandidate(state,agent(state),false,at);
equal(candidateAssessment(state,agent(state)).status,'failed','candidate cannot escape an unresolved critical issue');
state=recover(state,criticalIssue);
equal(view(state).readiness,'limited','critical repair does not clear the separate action protection gap');
state=simulate(state,'false-positive');
const fpIssue=currentIssue(state,'AGT-001','false-positive').id;
state=step(state,'acknowledge',fpIssue);
state=step(state,'dismiss-feedback',fpIssue);
equal(view(state).readiness,'limited','feedback closure does not override another incident');
state=recover(state,actionIssue);
equal(view(state).readiness,'ready','all required recovery work restores Ready');

// A draft failure never poisons the still-valid production assessment.
state=fixture();
const prod=structuredClone(view(state));
state=assessCandidate(state,agent(state),true,at);
equal(candidateAssessment(state,agent(state)).status,'failed','draft fail is stored for that revision');
equal(view(state),prod,'failed candidate assessment leaves production untouched');
const updatedAgent={...agent(state),revision:agent(state).revision+1,status:'draft'};
equal(candidateAssessment(state,updatedAgent),null,'changing revision invalidates candidate evidence');
deny(()=>deployGovernance(state,updatedAgent,'REL-NEW-REVISION'),'new revision cannot reuse old candidate report');

// Deploy a candidate, then revoke/recover production: revalidation must use the
// deployed binding, not the obsolete candidate record with the same version name.
state=fixture();
state=assessCandidate(state,agent(state),false,at);
const source=agent(state);
const firstVersion=source.versions.find(item=>item.version===source.activeVersion);
const deployedVersion={...structuredClone(firstVersion),version:source.nextVersion,releaseId:'REL-GOV-SECOND',revision:source.revision};
state={...state,governance:deployGovernance(state,source,deployedVersion.releaseId),agents:state.agents.map(item=>item.id===source.id?{...item,activeVersion:deployedVersion.version,nextVersion:'v1.4.0',versions:[deployedVersion,...item.versions]}:item)};
equal(view(state).readiness,'ready','new deployment receives candidate evidence');
state=simulate(state,'revoke-required');
issue=currentIssue(state,'AGT-001','policy-revoked');
equal(governanceGate(state,'AGT-001','general',firstVersion.releaseId).allowed,false,'revoked shared binding also blocks an older frozen release');
state=recover(state,issue.id);
equal(view(state).readiness,'ready','current production has a verified replacement');
equal(governanceGate(state,'AGT-001','general',firstVersion.releaseId).allowed,false,'old frozen release cannot silently adopt the replacement');
state=assessCandidate(state,agent(state),false,at);
equal(candidateAssessment(state,agent(state)).status,'passed','next candidate copies the actual recovered production binding');

console.log(`Governance checks passed: ${checks} assertions.`);

// Execution checkpoints must protect hydrated queues and confirmations as well as fresh requests.
const {enforceRunGovernance}=await import('../src/governance.ts');
const hydrated=structuredClone(initialState);
const blockedHydrated=transitionGovernance(hydrated,{type:'simulate',agentId:'AGT-001',scenario:'revoke-required'},'2026/11/04 14:00:00');
for(const status of ['queued','running','waiting']){
 const run={...hydrated.runs.find(r=>r.agentId==='AGT-001'),status,result:'unreleased output'};
 const checked=enforceRunGovernance(blockedHydrated,run,'checkpoint');
 assert.equal(checked.status,'blocked');assert.equal(checked.result,'');assert.equal(run.status,status);
}
const finished={...hydrated.runs[0],status:'success'};
assert.equal(enforceRunGovernance(blockedHydrated,finished,'checkpoint'),finished);
console.log('PASS: 10 execution checkpoint assertions.');
