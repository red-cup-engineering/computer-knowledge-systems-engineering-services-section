# Living Web composition profile

VICTOR's Living Web profile binds the catalog's live publication view to lower
protocol applications. It does not implement ActivityPub, Webmention,
Micropub, or IndieAuth itself.

```js
import { createPublicationActivityPubProvider } from '@red-cup-engineering/activitypub-services-section/publication';
import { activityPubApplication } from '@red-cup-engineering/activitypub-services-section/app';
import { webmentionReceiverApp } from '@red-cup-engineering/webmention-service';
import { createLivingWebApplicationFactory } from '@red-cup-engineering/victor';

export default {
  discovery: {
    webmention: '/webmention',
    micropub: '/micropub',
    indieauthMetadata: '/.well-known/oauth-authorization-server',
    me: ['https://social.example/@notes'],
  },
  applications: createLivingWebApplicationFactory({
    activityPub: {
      createProvider: createPublicationActivityPubProvider,
      createApplication: activityPubApplication,
      identifier: 'notes',
      actorName: 'Example Notes',
      summary: 'Published notes from this site.',
      keyPairs,
      kv,
      custody: (arrival) => activityInbox.put(arrival),
      authorizeInbox: ({ request }) => authorizeActivityPub(request),
    },
    webmention: {
      createReceiverApp: webmentionReceiverApp,
      custody: (record) => mentions.put(record),
    },
    applications: [micropubApp, indieAuthApp],
  }),
};
```

`createProvider` receives VICTOR's rebuild-aware `listPublications` callback and
the site's base IRI as its default origin. `createApplication` is the lower
ActivityPub package's exact, manifest-visible HTTP App adapter; VICTOR does not
maintain a second list of provider routes. ActivityPub custody becomes the
lower provider's inbox `onActivity` callback. No inbox is configured when
custody is absent, so the publication provider retains its fail-closed inbound
behavior.

`createReceiverApp` receives the supplied Webmention custody callback. Its
default ownership predicate accepts only URLs on the current site whose target
is present in VICTOR's current artifact inventory; it therefore follows live
rebuilds. A site may supply a narrower `ownsTarget` predicate.

The `applications` member is deliberately just an HTTP application, an array
of applications, or a factory receiving the ordinary VICTOR application
context. The active Micropub app and the OAuth resources profiled by the
IndieAuth service arrive there through their normal HTTP contracts, so this
module does not need to duplicate or wrap their protocol behavior.

The build-time `discovery` object is separate because endpoint advertisement
belongs to rendered pages. VICTOR validates and emits the corresponding
`webmention`, `micropub`, `indieauth-metadata`, and `me` link relations; only
configure links for applications actually mounted by the site.

Factories are injected rather than imported by VICTOR. This keeps each lower
application independently installable and makes the site's selected protocols
explicit dependencies of its own configuration.
