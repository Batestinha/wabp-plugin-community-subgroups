const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const plugin = require('../dist').default;
const api = require('../dist/serviceApi');
const actor = { wid: 'fixture@c.us', fromMe: false, identityAddress: { identityId: 'fixture-identity', canonicalWid: 'fixture@c.us', aliases: ['fixture@c.us'] } };
const requiredCreator = { identityId: 'fixture-identity', participantWid: 'fixture@c.us', evidenceDigest: 'a'.repeat(64) };
const t = (key) => plugin.manifest.defaultMessages[key] ?? key;

function harness({ config = {}, store = new Map(), ownership = async () => ({ kind: 'unowned' }) } = {}) {
  const commands = new Map(), resolvers = [], handlers = new Map(), starts = [];
  const dataStore = {
    get: async (key) => structuredClone(store.get(key)),
    set: async (key, value) => { store.set(key, structuredClone(value)); },
    delete: async (key) => Number(store.delete(key)), list: async () => []
  };
  const context = {
    pluginId: plugin.manifest.pluginId, manifest: plugin.manifest, dataStore,
    configFor: async () => config,
    router: { register: (namespace, name, metadata, handler) => commands.set(`${namespace}.${name}`, handler) },
    i18n: { translator: () => t, translatorForIdentity: async () => t },
    flowEngine: {
      registerDefinitionResolver: (resolver) => resolvers.push(resolver),
      registerPromptHandler: (purpose, handler) => handlers.set(purpose, handler),
      getSessionSnapshot: async () => starts.at(-1)?.session,
      startFlow: async (input) => {
        const session = { id: 'fixture-session', flowType: input.definition.flowType, scopeId: input.scopeId,
          identityId: actor.identityAddress.identityId, chatId: input.message.chatId, status: 'ACTIVE',
          state: { currentStepId: input.definition.initialStepId, history: [], data: {} }, expiresAt: new Date('2099-01-01') };
        assert.equal(store.size, 0, 'no draft exists before session persistence');
        await input.onSessionCreated(session);
        assert.equal(store.size, 1, 'the draft is durable before first prompt delivery');
        starts.push({ input, session });
        return { flowSessionId: session.id };
      }
    },
    services: { call: ownership },
    communityGroupWidForScope: async () => 'community@g.us',
    communityParentGroupWidForGroup: async () => 'community@g.us',
    isCommunityChildGroup: async () => true
  };
  plugin.registerCommands(context);
  return { store, starts, resolvers, handlers, context,
    run: (name, args = []) => commands.get(name)({ actor, t, args, command: { args, rawArgs: args.join(' ') },
      scopeId: 'fixture-scope', groupId: 'fixture-group', groupWid: 'fixture@g.us', managementMode: 'MANAGE',
      message: { id: 'fixture-command', chatId: 'fixture@g.us', senderWid: actor.wid, context: 'group', replyTo: { messageId: 'fixture-quoted' } }
    }) };
}

test('retains customized settings and does not start a disabled subgroup flow', async () => {
  const config = { enabled: false, maxParticipants: 7, creationPolicy: { joinApproval: true } };
  const h = harness({ config });
  const result = await h.run('subgroup.create');
  assert.ok(result.text);
  assert.equal(h.starts.length, 0);
  assert.equal(h.store.size, 0);
  assert.equal(plugin.manifest.configSchema.parse(config).maxParticipants, 7);
  assert.equal(plugin.manifest.configSchema.parse(config).creationPolicy.joinApproval, true);
});

for (const kind of ['create', 'pin']) {
  test(`persists and resumes ${kind} from a fresh plugin registration`, async () => {
    const original = harness();
    await original.run(kind === 'create' ? 'subgroup.create' : 'pin.*');
    const { input, session } = original.starts[0];
    const restarted = harness({ store: original.store });
    const resolver = restarted.resolvers.find((r) => session.flowType.startsWith(r.flowTypePrefix));
    const definition = await resolver.resolve(session);
    assert.equal(definition.flowType, input.definition.flowType);
    assert.deepEqual(Object.keys(definition.steps), Object.keys(input.definition.steps));
    assert.equal(restarted.handlers.size, 1);
    assert.equal(restarted.store.size, 1);
    if (kind === 'pin') assert.deepEqual(definition.steps.duration.promptSendOptionsForState(session.state), { quotedMessageId: 'fixture-command' });
    for (const altered of [{ scopeId: 'other-scope' }, { identityId: 'other-actor' }, { chatId: 'other@g.us' }, { id: 'other-session' }]) {
      assert.equal(await resolver.resolve({ ...session, ...altered }), undefined);
    }
    await input.onSessionStartFailed(session, new Error('preparation failed'));
    assert.equal(original.store.size, 0);
  });
}

test('resumes older pin drafts without the new optional identity and quote fields', async () => {
  const h = harness();
  await h.run('pin.*');
  for (const draft of h.store.values()) { delete draft.actorIdentityId; delete draft.promptQuotedMessageId; }
  const restarted = harness({ store: h.store });
  const session = h.starts[0].session;
  const definition = await restarted.resolvers.find((r) => session.flowType.startsWith(r.flowTypePrefix)).resolve(session);
  assert.equal(definition.flowType, session.flowType);
  assert.equal(definition.steps.duration.promptSendOptionsForState, undefined);
});

test('event-owned titles and unavailable ownership checks remain protected', async () => {
  for (const ownership of [async () => ({ kind: 'owned', eventId: 'fixture-event' }), async () => { throw new Error('unavailable'); }]) {
    const h = harness({ ownership });
    const result = await h.run('title.*', ['Fixture title']);
    assert.equal(result.pluginActions, undefined);
    assert.ok(result.text);
  }
  const unowned = await harness().run('title.*', ['Fixture title']);
  assert.equal(unowned.pluginActions?.[0].type, 'group.setSubject');
});

test('requires the initiating actor and delegates limits and creation policy to the host', async () => {
  const calls = [];
  const operations = Object.fromEntries(['createManagedCommunitySubgroupCandidate', 'reconcileManagedCommunitySubgroupCreator', 'configureManagedCommunitySubgroup', 'completeManagedCommunitySubgroup']
    .map((name) => [name, async (input) => { calls.push({ name, input }); return { fixture: true }; }]));
  const methods = plugin.registerServices({ configFor: async () => ({ maxParticipants: 1, creationPolicy: { joinApproval: true } }),
    platform: { communityOperations: operations } })[0].methods;
  const candidate = methods.find((m) => m.name === api.COMMUNITY_SUBGROUPS_CANDIDATE_METHOD);
  await assert.rejects(candidate.handler({ title: 'Fixture', parentCommunityWid: 'community@g.us' }, { scopeId: 'fixture-scope' }), /requires an actor/);
  assert.equal(calls.length, 0);
  const complete = methods.find((m) => m.name === api.COMMUNITY_SUBGROUPS_COMPLETE_METHOD);
  const input = { chatId: 'fixture@g.us', title: 'Fixture', requiredCreator, parentCommunityWid: 'community@g.us', participantWids: ['one@c.us', 'one@c.us', 'two@c.us'] };
  await assert.rejects(complete.handler(input, { scopeId: 'fixture-scope', actorIdentityId: 'wrong-actor' }), /does not match/);
  assert.equal(calls.length, 0);
  await complete.handler(input, { scopeId: 'fixture-scope', actorIdentityId: requiredCreator.identityId });
  assert.deepEqual(calls[0].input.participantWids, ['one@c.us']);
  assert.equal(calls[0].input.creationPolicy.joinApproval, true);
  assert.match(calls[0].input.participants['two@c.us'].message, /configured maximum 1/);
});

test('ships Portuguese messages, ordinary controls and the pinned service contract', () => {
  const metadata = require('../wa-plugin.json');
  const pt = require('../locales/pt-PT/official.community-subgroups.json');
  assert.equal(metadata.pluginId, 'official.community-subgroups');
  assert.equal(metadata.version, plugin.manifest.version);
  assert.equal(metadata.operatorConsole.controls.length, 9);
  for (const key of Object.keys(plugin.manifest.defaultMessages)) assert.ok(pt[key]?.trim(), key);
  assert.deepEqual(fs.readFileSync('contracts/community-events-v1.ts'), fs.readFileSync('src/contracts/community-events-v1.ts'));
  assert.equal(plugin.lifecycle, undefined);
});
