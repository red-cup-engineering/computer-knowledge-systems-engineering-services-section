/**
 * Compose protocol-owning lower applications around VICTOR's live publication
 * view. Factories are injected so this profile does not copy protocol logic or
 * make ActivityPub, Webmention, Micropub, or IndieAuth mandatory dependencies.
 */
export function createLivingWebApplicationFactory(profile = {}) {
  return (context) => composeLivingWebApplications(context, profile);
}

export async function composeLivingWebApplications(context, profile = {}) {
  requireContext(context);
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new TypeError('Living Web profile must be an object');
  }
  const applications = [];

  if (profile.activityPub !== undefined && profile.activityPub !== false) {
    applications.push(await activityPubApplication(context, profile.activityPub));
  }
  if (profile.webmention !== undefined && profile.webmention !== false) {
    applications.push(await webmentionApplication(context, profile.webmention));
  }
  applications.push(...await ordinaryApplications(context, profile.applications));
  return Object.freeze(applications);
}

/** Return a rebuild-aware ownership predicate for generated VICTOR artifacts. */
export function ownsVictorTarget(context) {
  requireContext(context);
  return (target) => {
    const url = target instanceof URL ? target : new URL(target);
    const build = context.getBuild();
    if (url.origin !== new URL(build.site.baseIri).origin) return false;
    let path;
    try { path = decodeURIComponent(url.pathname).replace(/^\/+/, ''); }
    catch { return false; }
    const artifact = path === '' ? 'index.html' : path.endsWith('/') ? `${path}index.html` : path;
    return build.artifacts instanceof Map
      && (build.artifacts.has(artifact) || (path !== '' && !path.endsWith('/') && build.artifacts.has(`${path}/index.html`)));
  };
}

async function activityPubApplication(context, configuration) {
  if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) {
    throw new TypeError('Living Web ActivityPub configuration must be an object');
  }
  const {
    createProvider, createApplication, custody, authorizeInbox, inbox,
    ...providerOptions
  } = configuration;
  if (typeof createProvider !== 'function') {
    throw new TypeError('Living Web ActivityPub configuration requires createProvider(options)');
  }
  if (typeof createApplication !== 'function') {
    throw new TypeError('Living Web ActivityPub configuration requires createApplication(provider)');
  }
  if (custody !== undefined && typeof custody !== 'function') {
    throw new TypeError('Living Web ActivityPub custody must be a function');
  }
  if (authorizeInbox !== undefined && typeof authorizeInbox !== 'function') {
    throw new TypeError('Living Web ActivityPub authorizeInbox must be a function');
  }
  if (inbox !== undefined && custody !== undefined) {
    throw new TypeError('Living Web ActivityPub configuration accepts either inbox or custody, not both');
  }
  if (authorizeInbox !== undefined && custody === undefined) {
    throw new TypeError('Living Web ActivityPub authorizeInbox accompanies custody; include it in an explicit inbox adapter otherwise');
  }
  const custodyInbox = custody === undefined ? undefined : Object.freeze({
    onActivity: custody,
    ...(authorizeInbox === undefined ? {} : { authorizeInbox }),
  });
  const provider = await createProvider({
    ...providerOptions,
    origin: providerOptions.origin ?? context.site.baseIri,
    listPublications: context.listPublications,
    ...((inbox ?? custodyInbox) === undefined ? {} : { inbox: inbox ?? custodyInbox }),
  });
  if (!provider || typeof provider.fetch !== 'function') {
    throw new TypeError('Living Web ActivityPub createProvider must return a provider with fetch(request)');
  }
  const application = await createApplication(provider);
  if (!application || typeof application !== 'object' || Array.isArray(application)) {
    throw new TypeError('Living Web ActivityPub createApplication must return an HTTP application');
  }
  return application;
}

async function webmentionApplication(context, configuration) {
  if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) {
    throw new TypeError('Living Web Webmention configuration must be an object');
  }
  const { createReceiverApp, custody, ownsTarget, ...receiverOptions } = configuration;
  if (typeof createReceiverApp !== 'function') {
    throw new TypeError('Living Web Webmention configuration requires createReceiverApp(options)');
  }
  if (typeof custody !== 'function') {
    throw new TypeError('Living Web Webmention configuration requires custody(record)');
  }
  const application = await createReceiverApp({
    ...receiverOptions,
    custody,
    ownsTarget: ownsTarget ?? ownsVictorTarget(context),
  });
  if (!application || typeof application !== 'object' || Array.isArray(application)) {
    throw new TypeError('Living Web Webmention createReceiverApp must return an HTTP application');
  }
  return application;
}

async function ordinaryApplications(context, configured) {
  if (configured === undefined) return [];
  const value = typeof configured === 'function' ? await configured(context) : configured;
  if (value === undefined) return [];
  const applications = Array.isArray(value) ? value : [value];
  for (const application of applications) {
    if (!application || typeof application !== 'object' || Array.isArray(application)) {
      throw new TypeError('Living Web additional applications must be HTTP application objects');
    }
  }
  return applications;
}

function requireContext(context) {
  if (!context || typeof context !== 'object'
      || typeof context.listPublications !== 'function'
      || typeof context.getBuild !== 'function') {
    throw new TypeError('Living Web composition requires a VICTOR application factory context');
  }
}
