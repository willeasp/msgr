import { describe, expect, it, vi } from 'vitest';
import type { Message } from '../domain/message.js';
import type { User } from '../domain/user.js';
import { Page } from '../domain/page.js';
import { ok } from '../domain/result.js';
import { exampleMovie, movieInput } from '../testing/movies.js';
import { examplePicture, pictureInput } from '../testing/pictures.js';
import { exampleSound, soundInput } from '../testing/sounds.js';
import {
  movieUpload,
  pictureUpload,
  soundUpload,
  type Put,
} from '../testing/uploads.js';
import { UPLOAD_KEPT_MS } from '../domain/upload.js';
import {
  createTestApp,
  expectOk,
  fakeBrowser,
  nextEvent,
  recordingPushSender,
} from '../testing/harness.js';

async function team() {
  const app = createTestApp();
  const ada = await app.fixtures.user({ name: 'Ada' });
  const grace = await app.fixtures.user({ name: 'Grace' });
  const linus = await app.fixtures.user({ name: 'Linus' });
  const chat = await app.fixtures.groupChat('Team', [ada, grace]);
  return { ...app, ada, grace, linus, chat };
}

/** Sends each [sender, text] to the chat in turn; the messages as sent. */
async function sendAll(
  services: Awaited<ReturnType<typeof team>>['services'],
  chatId: string,
  messages: readonly (readonly [User, string])[]
): Promise<Message[]> {
  const sent: Message[] = [];
  for (const [sender, content] of messages) {
    sent.push(
      expectOk(await services().messages.send(sender, { chatId, content }))
    );
  }
  return sent;
}

describe('sending a message', () => {
  it('stores the trimmed text, stamped by the clock', async () => {
    const sentAt = new Date('2031-05-01T09:30:00.000Z');
    const app = createTestApp({ clock: () => sentAt });
    const ada = await app.fixtures.user({ name: 'Ada' });
    const chat = await app.fixtures.groupChat('Notes', [ada]);

    const message = expectOk(
      await app
        .services()
        .messages.send(ada, { chatId: chat.id, content: '  hi \n' })
    );

    expect(message).toEqual({
      id: message.id,
      chatId: chat.id,
      senderId: ada.id,
      content: 'hi',
      picture: null,
      movie: null,
      sound: null,
      createdAt: sentAt,
    });
  });

  it("pushes it to the other participants' browsers, without waiting for them", async () => {
    const push = recordingPushSender();
    const app = createTestApp({ pushSender: push.sender });
    const ada = await app.fixtures.user({ name: 'Ada' });
    const grace = await app.fixtures.user({ name: 'Grace' });
    const chat = await app.fixtures.groupChat('Team', [ada, grace]);
    await app.deps.repositories.pushSubscriptions.save(
      grace.id,
      fakeBrowser('grace-phone')
    );

    expectOk(
      await app
        .services()
        .messages.send(ada, { chatId: chat.id, content: 'hi' })
    );

    await vi.waitFor(() =>
      expect(push.sent).toEqual([
        {
          endpoint: fakeBrowser('grace-phone').endpoint,
          notification: { title: 'Ada in Team', body: 'hi', chatId: chat.id },
          // Grace hasn't read it yet: the badge on her app.
          unread: 1,
        },
      ])
    );
  });

  it('delivers it live to every participant and nobody else', async () => {
    const { services, ada, grace, linus, chat } = await team();
    const toAda = nextEvent(services().messages.feed(ada));
    const toGrace = nextEvent(services().messages.feed(grace));
    const toLinus = nextEvent(services().messages.feed(linus));

    const message = expectOk(
      await services().messages.send(ada, { chatId: chat.id, content: 'hi' })
    );

    expect(await toAda).toEqual(message);
    expect(await toGrace).toEqual(message);
    expect(await toLinus).toBe('nothing');
  });

  it("moves the chat to the top of its participants' lists", async () => {
    const { fixtures, services, ada, grace, chat } = await team();
    const other = await fixtures.groupChat('Other', [ada, grace]);
    const post = (chatId: string, content: string) =>
      services().messages.send(grace, { chatId, content });
    const order = async () =>
      (await services().chats.listFor(ada)).map(({ id }) => id);

    await post(chat.id, 'first');
    await post(other.id, 'second');
    expect(await order()).toEqual([other.id, chat.id]);

    await post(chat.id, 'third');
    expect(await order()).toEqual([chat.id, other.id]);
  });

  it('rejects blank text before looking at the chat', async () => {
    const { services, ada } = await team();

    expect(
      await services().messages.send(ada, { chatId: 'missing', content: ' ' })
    ).toMatchObject({
      ok: false,
      error: { type: 'InvalidInput', field: 'content' },
    });
  });

  it("refuses to post into someone else's chat", async () => {
    const { services, linus, chat } = await team();

    expect(
      await services().messages.send(linus, { chatId: chat.id, content: 'hi' })
    ).toEqual({ ok: false, error: { type: 'NotFound', entity: 'Chat' } });
  });
});

describe('sending under an id the sender chose', () => {
  const CHOSEN = '3f0e1c2a-9b4d-4c8e-a1f2-0123456789ab';

  it('keeps the id, and sending it again returns the same message, stored and delivered once', async () => {
    const { services, ada, grace, chat } = await team();
    const toGrace = services().messages.feed(grace);
    const delivered = nextEvent(toGrace);
    const send = () =>
      services().messages.send(ada, {
        id: CHOSEN,
        chatId: chat.id,
        content: 'hi',
      });

    const first = expectOk(await send());
    const again = expectOk(await send());

    expect(first.id).toBe(CHOSEN);
    expect(again).toEqual(first);
    expect(
      expectOk(await services().messages.list(grace, { chatId: chat.id }))
    ).toEqual([first]);
    expect(await delivered).toEqual(first);
    expect(await nextEvent(toGrace)).toBe('nothing');
  });

  it('stores sends of one id at the same moment once, answering each with it', async () => {
    const { services, ada, chat } = await team();
    const send = () =>
      services().messages.send(ada, {
        id: CHOSEN,
        chatId: chat.id,
        content: 'hi',
      });

    const [first, second] = await Promise.all([send(), send()]);

    expect(expectOk(second)).toEqual(expectOk(first));
    expect(
      expectOk(await services().messages.list(ada, { chatId: chat.id }))
    ).toHaveLength(1);
  });

  it('answers a send again, once its sender has left the chat, as for any chat they’re not in', async () => {
    const { services, ada } = await team();
    const channel = expectOk(
      await services().chats.joinChannel(ada, 'leaving')
    );
    const send = () =>
      services().messages.send(ada, {
        id: CHOSEN,
        chatId: channel.id,
        content: 'bye',
      });
    expectOk(await send());
    expectOk(await services().chats.leaveChannel(ada, channel.id));

    expect(await send()).toEqual({
      ok: false,
      error: { type: 'NotFound', entity: 'Chat' },
    });
  });

  it("refuses an id that's someone else's, or in another chat, or no UUID at all", async () => {
    const { fixtures, services, ada, grace, chat } = await team();
    const other = await fixtures.groupChat('Other', [ada, grace]);
    expectOk(
      await services().messages.send(grace, {
        id: CHOSEN,
        chatId: chat.id,
        content: 'mine',
      })
    );
    const refused = {
      ok: false,
      error: { type: 'InvalidInput', field: 'id' },
    };

    expect(
      await services().messages.send(ada, {
        id: CHOSEN,
        chatId: chat.id,
        content: 'hi',
      })
    ).toMatchObject(refused);
    expect(
      await services().messages.send(grace, {
        id: CHOSEN,
        chatId: other.id,
        content: 'hi',
      })
    ).toMatchObject(refused);
    expect(
      await services().messages.send(ada, {
        id: 'not-a-uuid',
        chatId: chat.id,
        content: 'hi',
      })
    ).toMatchObject(refused);
  });
});

describe('sending a picture', () => {
  it('stores it alone or with text, stamped by the clock, and delivers it live', async () => {
    const { services, ada, grace, linus, chat } = await team();
    const toGrace = nextEvent(services().messages.feed(grace));
    const toLinus = nextEvent(services().messages.feed(linus));

    const alone = expectOk(
      await services().messages.send(ada, {
        chatId: chat.id,
        picture: pictureInput(),
      })
    );
    const captioned = expectOk(
      await services().messages.send(ada, {
        chatId: chat.id,
        content: ' look ',
        picture: pictureInput(),
      })
    );

    expect(alone).toEqual({
      id: alone.id,
      chatId: chat.id,
      senderId: ada.id,
      content: null,
      picture: {
        width: examplePicture().width,
        height: examplePicture().height,
      },
      movie: null,
      sound: null,
      createdAt: expect.any(Date),
    });
    expect(captioned).toMatchObject({ content: 'look' });
    // Its bytes, as the server compressed them, come on their own.
    expect(
      await services().messages.media(grace, captioned.id, 'picture')
    ).toEqual(ok(examplePicture().deflated));
    expect(await toGrace).toEqual(alone);
    expect(await toLinus).toBe('nothing');
  });

  it('rejects a bad picture, or nothing at all, before looking at the chat', async () => {
    const { services, ada, chat } = await team();
    // Inked off its 8×1 canvas, so blank.
    const blankPicture = pictureInput(8, 1, 5);

    for (const [input, field] of [
      [{ picture: blankPicture }, 'picture'],
      [{ picture: { ...pictureInput(), width: 321 } }, 'picture'],
      [{ content: 'hi', picture: blankPicture }, 'picture'],
      [{}, 'content'],
      [{ content: null, picture: null }, 'content'],
    ] as const) {
      expect(
        await services().messages.send(ada, { chatId: 'missing', ...input })
      ).toMatchObject({ ok: false, error: { type: 'InvalidInput', field } });
    }
    expect(
      expectOk(await services().messages.list(ada, { chatId: chat.id }))
    ).toEqual([]);
  });

  it("refuses to post into someone else's chat", async () => {
    const { services, linus, chat } = await team();

    expect(
      await services().messages.send(linus, {
        chatId: chat.id,
        picture: pictureInput(),
      })
    ).toEqual({ ok: false, error: { type: 'NotFound', entity: 'Chat' } });
  });
});

describe('sending a movie', () => {
  it('stores it alone or with text, coded by the server, and delivers it live', async () => {
    const { services, ada, grace, chat } = await team();
    const toGrace = nextEvent(services().messages.feed(grace));

    const alone = expectOk(
      await services().messages.send(ada, {
        chatId: chat.id,
        movie: movieInput(),
      })
    );
    const captioned = expectOk(
      await services().messages.send(ada, {
        chatId: chat.id,
        content: 'look',
        movie: movieInput(),
      })
    );

    expect(alone).toEqual({
      id: alone.id,
      chatId: chat.id,
      senderId: ada.id,
      content: null,
      picture: null,
      movie: {
        width: exampleMovie().width,
        height: exampleMovie().height,
        frames: exampleMovie().frames,
      },
      sound: null,
      createdAt: expect.any(Date),
    });
    expect(captioned).toMatchObject({ content: 'look' });
    expect(await services().messages.media(ada, alone.id, 'movie')).toEqual(
      ok(exampleMovie().coded)
    );
    expect(await toGrace).toEqual(alone);
  });

  it('rejects a bad movie, or a movie with a picture, before looking at the chat', async () => {
    const { services, ada } = await team();
    // Inked off its 8×1 canvas in every frame, so blank.
    const blankMovie = movieInput(8, 1, 2, 8);

    for (const input of [
      { movie: blankMovie },
      { movie: { ...movieInput(), frames: 49 } },
      { content: 'hi', picture: pictureInput(), movie: movieInput() },
    ]) {
      expect(
        await services().messages.send(ada, { chatId: 'missing', ...input })
      ).toMatchObject({
        ok: false,
        error: { type: 'InvalidInput', field: 'movie' },
      });
    }
  });
});

describe('sending a sound', () => {
  it('stores it alone or with text, coded by the server, and delivers it live', async () => {
    const { services, ada, grace, chat } = await team();
    const toGrace = nextEvent(services().messages.feed(grace));

    const alone = expectOk(
      await services().messages.send(ada, {
        chatId: chat.id,
        sound: soundInput(),
      })
    );
    const captioned = expectOk(
      await services().messages.send(ada, {
        chatId: chat.id,
        content: 'listen',
        sound: soundInput(),
      })
    );

    expect(alone).toEqual({
      id: alone.id,
      chatId: chat.id,
      senderId: ada.id,
      content: null,
      picture: null,
      movie: null,
      sound: { frames: exampleSound().frames },
      createdAt: expect.any(Date),
    });
    expect(captioned).toMatchObject({ content: 'listen' });
    expect(await services().messages.media(ada, alone.id, 'sound')).toEqual(
      ok(exampleSound().coded)
    );
    expect(await toGrace).toEqual(alone);
  });

  it('rejects a bad sound, or a sound with something else, before looking at the chat', async () => {
    const { services, ada } = await team();

    for (const input of [
      { sound: soundInput(1, 0) },
      { sound: { ...soundInput(), frames: 3002 } },
      { content: 'hi', movie: movieInput(), sound: soundInput() },
      { picture: pictureInput(), sound: soundInput() },
    ]) {
      expect(
        await services().messages.send(ada, { chatId: 'missing', ...input })
      ).toMatchObject({
        ok: false,
        error: { type: 'InvalidInput', field: 'sound' },
      });
    }
  });
});

describe('sending what was put ahead of it', () => {
  const CHOSEN = '3f0e1c2a-9b4d-4c8e-a1f2-0123456789ab';
  const put = (
    services: Awaited<ReturnType<typeof team>>['services'],
    sender: User,
    { raw, bytes }: Put,
    id = CHOSEN
  ) => services().messages.upload(sender, id, raw, bytes);

  it('stores a picture, movie or sound put under its id, alone or with text, and delivers it live', async () => {
    const { services, ada, grace, chat } = await team();
    const toGrace = services().messages.feed(grace);
    const ids = [
      '3f0e1c2a-9b4d-4c8e-a1f2-000000000001',
      '3f0e1c2a-9b4d-4c8e-a1f2-000000000002',
      '3f0e1c2a-9b4d-4c8e-a1f2-000000000003',
    ] as const;
    const [pictureId, movieId, soundId] = ids;

    expect(await put(services, ada, pictureUpload(), pictureId)).toEqual(
      ok(true)
    );
    expectOk(await put(services, ada, movieUpload(), movieId));
    expectOk(await put(services, ada, soundUpload(), soundId));
    const delivered = nextEvent(toGrace);
    const picture = expectOk(
      await services().messages.send(ada, {
        id: pictureId,
        chatId: chat.id,
        uploaded: 'picture',
      })
    );
    const movie = expectOk(
      await services().messages.send(ada, {
        id: movieId,
        chatId: chat.id,
        content: ' look ',
        uploaded: 'movie',
      })
    );
    const sound = expectOk(
      await services().messages.send(ada, {
        id: soundId,
        chatId: chat.id,
        uploaded: 'sound',
      })
    );

    expect(picture).toEqual({
      id: pictureId,
      chatId: chat.id,
      senderId: ada.id,
      content: null,
      picture: {
        width: examplePicture().width,
        height: examplePicture().height,
      },
      movie: null,
      sound: null,
      createdAt: expect.any(Date),
    });
    expect(movie).toMatchObject({ content: 'look', movie: { frames: 3 } });
    expect(sound).toMatchObject({ content: null, sound: { frames: 26 } });
    // The bytes the server keeps, as if they'd come inside the message.
    expect(
      await services().messages.media(grace, pictureId, 'picture')
    ).toEqual(ok(examplePicture().deflated));
    expect(await services().messages.media(grace, movieId, 'movie')).toEqual(
      ok(exampleMovie().coded)
    );
    expect(await services().messages.media(grace, soundId, 'sound')).toEqual(
      ok(exampleSound().coded)
    );
    expect(await delivered).toEqual(picture);
  });

  it('checks what was put as any message’s, before keeping it', async () => {
    const { services, ada, chat } = await team();
    const blank = pictureUpload(8, 1, 5);
    const noise = { ...movieUpload(), bytes: new Uint8Array([1, 2, 3]) };
    const silence = soundUpload(0.5, 0);
    const huge = { ...pictureUpload(), bytes: new Uint8Array(200_000) };

    for (const [upload, id, field] of [
      [blank, CHOSEN, 'picture'],
      [noise, CHOSEN, 'movie'],
      [silence, CHOSEN, 'sound'],
      [huge, CHOSEN, 'picture'],
      [
        { ...pictureUpload(), raw: { part: 'picture', width: NaN, height: 7 } },
        CHOSEN,
        'picture',
      ],
      [pictureUpload(), 'not-a-uuid', 'id'],
      [pictureUpload(), 'cmh0aaaaa0000aaaaaaaaaaaa', 'id'],
    ] as const) {
      expect(await put(services, ada, upload, id)).toMatchObject({
        ok: false,
        error: { type: 'InvalidInput', field },
      });
    }
    expect(
      await services().messages.send(ada, {
        id: CHOSEN,
        chatId: chat.id,
        uploaded: 'picture',
      })
    ).toMatchObject({ ok: false, error: { field: 'uploaded' } });
  });

  it('takes the last put under an id, so putting it again is always safe', async () => {
    const { services, ada, chat } = await team();
    expectOk(await put(services, ada, pictureUpload()));
    expectOk(await put(services, ada, soundUpload()));

    expect(
      await services().messages.send(ada, {
        id: CHOSEN,
        chatId: chat.id,
        uploaded: 'picture',
      })
    ).toMatchObject({ ok: false, error: { field: 'uploaded' } });
    expect(
      expectOk(
        await services().messages.send(ada, {
          id: CHOSEN,
          chatId: chat.id,
          uploaded: 'sound',
        })
      )
    ).toMatchObject({ sound: { frames: 26 } });
  });

  it('answers a send again, its upload put again, with the message stored and delivered once', async () => {
    const { services, ada, grace, chat } = await team();
    const toGrace = services().messages.feed(grace);
    const delivered = nextEvent(toGrace);
    const send = () =>
      services().messages.send(ada, {
        id: CHOSEN,
        chatId: chat.id,
        uploaded: 'picture',
      });
    expectOk(await put(services, ada, pictureUpload()));
    const first = expectOk(await send());

    // Its answer lost: Try Again puts it again, then sends it again.
    expect(await put(services, ada, pictureUpload())).toEqual(ok(true));
    expect(expectOk(await send())).toEqual(first);
    // Nothing of it is left to send twice.
    expect(
      await services().messages.send(ada, {
        id: CHOSEN,
        chatId: chat.id,
        content: 'again',
      })
    ).toEqual(ok(first));
    expect(
      expectOk(await services().messages.list(grace, { chatId: chat.id }))
    ).toEqual([first]);
    expect(await delivered).toEqual(first);
    expect(await nextEvent(toGrace)).toBe('nothing');
  });

  it("refuses an id that's someone else's upload or message, or their own message with another part", async () => {
    const { services, ada, grace, chat } = await team();
    const OTHER = '3f0e1c2a-9b4d-4c8e-a1f2-0000000000ff';
    const taken = {
      ok: false,
      error: {
        type: 'InvalidInput',
        field: 'id',
        reason: 'That message id is taken',
      },
    };
    expectOk(await put(services, grace, pictureUpload()));
    expectOk(await put(services, grace, pictureUpload(), OTHER));
    expectOk(
      await services().messages.send(grace, {
        id: OTHER,
        chatId: chat.id,
        uploaded: 'picture',
      })
    );

    // Grace's upload.
    expect(await put(services, ada, pictureUpload())).toMatchObject(taken);
    expect(
      await services().messages.send(ada, {
        id: CHOSEN,
        chatId: chat.id,
        uploaded: 'picture',
      })
    ).toMatchObject(taken);
    // Grace's message.
    expect(await put(services, ada, pictureUpload(), OTHER)).toMatchObject(
      taken
    );
    // Her own, with a sound rather than its picture.
    expect(await put(services, grace, soundUpload(), OTHER)).toMatchObject(
      taken
    );
    // And Grace's upload is still hers to send.
    expectOk(
      await services().messages.send(grace, {
        id: CHOSEN,
        chatId: chat.id,
        uploaded: 'picture',
      })
    );
  });

  it('refuses a send naming an upload without its id, beside another, or in someone else’s chat', async () => {
    const { services, ada, linus, chat } = await team();
    expectOk(await put(services, ada, pictureUpload()));
    expectOk(
      await put(
        services,
        linus,
        movieUpload(),
        '3f0e1c2a-9b4d-4c8e-a1f2-0000000000aa'
      )
    );

    for (const [sender, input, error] of [
      [ada, { uploaded: 'picture' }, { field: 'id' }],
      [
        ada,
        { id: CHOSEN, uploaded: 'picture', picture: pictureInput() },
        { field: 'uploaded' },
      ],
      [
        linus,
        { id: '3f0e1c2a-9b4d-4c8e-a1f2-0000000000aa', uploaded: 'movie' },
        { type: 'NotFound', entity: 'Chat' },
      ],
    ] as const) {
      expect(
        await services().messages.send(sender, { chatId: chat.id, ...input })
      ).toMatchObject({ ok: false, error });
    }
    // Ada's upload is still there to send.
    expectOk(
      await services().messages.send(ada, {
        id: CHOSEN,
        chatId: chat.id,
        uploaded: 'picture',
      })
    );
  });

  it('forgets an upload an hour after it was put, when anyone puts another', async () => {
    let now = new Date('2030-01-01T00:00:00.000Z').getTime();
    const app = createTestApp({ clock: () => new Date(now) });
    const ada = await app.fixtures.user({ name: 'Ada' });
    const grace = await app.fixtures.user({ name: 'Grace' });
    const chat = await app.fixtures.groupChat('Team', [ada, grace]);
    const send = (id: string) =>
      app.services().messages.send(ada, {
        id,
        chatId: chat.id,
        uploaded: 'picture',
      });
    const KEPT = '3f0e1c2a-9b4d-4c8e-a1f2-0000000000bb';
    expectOk(await put(app.services, ada, pictureUpload()));
    now += UPLOAD_KEPT_MS / 2;
    expectOk(await put(app.services, ada, pictureUpload(), KEPT));

    now += UPLOAD_KEPT_MS / 2 + 1;
    expectOk(
      await put(
        app.services,
        grace,
        soundUpload(),
        '3f0e1c2a-9b4d-4c8e-a1f2-0000000000cc'
      )
    );

    expect(await send(CHOSEN)).toMatchObject({
      ok: false,
      error: { field: 'uploaded', reason: 'Upload it before sending it' },
    });
    expectOk(await send(KEPT));
  });
});

describe('reading messages', () => {
  it('pages back from the newest message, each page oldest first', async () => {
    const { services, ada, grace, chat } = await team();
    const sent: Message[] = [];
    for (const [sender, content] of [
      [ada, 'one'],
      [grace, 'two'],
      [ada, 'three'],
    ] as const) {
      sent.push(
        expectOk(
          await services().messages.send(sender, { chatId: chat.id, content })
        )
      );
    }
    const read = async (limit?: number, offset?: number) =>
      expectOk(
        await services().messages.list(grace, {
          chatId: chat.id,
          limit,
          offset,
        })
      );

    expect(await read()).toEqual(sent);
    expect(await read(2)).toEqual(sent.slice(1));
    expect(await read(2, 2)).toEqual(sent.slice(0, 1));
  });

  it("refuses to read someone else's chat", async () => {
    const { services, linus, chat } = await team();

    expect(await services().messages.list(linus, { chatId: chat.id })).toEqual({
      ok: false,
      error: { type: 'NotFound', entity: 'Chat' },
    });
  });

  it('pages from a cursor in the chat, and not from one anywhere else', async () => {
    const { services, fixtures, ada, grace, chat } = await team();
    const [one, two, three] = (await sendAll(services, chat.id, [
      [ada, 'one'],
      [grace, 'two'],
      [ada, 'three'],
    ])) as [Message, Message, Message];
    const elsewhere = await fixtures.groupChat('Elsewhere', [ada]);
    const aside = expectOk(
      await services().messages.send(ada, {
        chatId: elsewhere.id,
        content: 'aside',
      })
    );

    expect(
      await services().messages.list(grace, {
        chatId: chat.id,
        before: three.id,
      })
    ).toEqual(ok([one, two]));
    expect(
      await services().messages.list(grace, { chatId: chat.id, after: one.id })
    ).toEqual(ok([two, three]));
    // A cursor from another chat, or none at all, is missing: start again.
    for (const cursor of [aside.id, 'missing']) {
      expect(
        await services().messages.list(grace, {
          chatId: chat.id,
          after: cursor,
        })
      ).toEqual({ ok: false, error: { type: 'NotFound', entity: 'Message' } });
    }
  });

  it('rejects a page outside the bounds', async () => {
    const { services, ada, chat } = await team();

    expect(
      await services().messages.list(ada, {
        chatId: chat.id,
        limit: Page.MAX_LIMIT + 1,
      })
    ).toMatchObject({
      ok: false,
      error: { type: 'InvalidInput', field: 'limit' },
    });
  });
});

describe("a message's media", () => {
  it('is for whoever may see the message, and only the part it has', async () => {
    const { services, ada, grace, linus, chat } = await team();
    const picture = expectOk(
      await services().messages.send(ada, {
        chatId: chat.id,
        picture: pictureInput(),
      })
    );
    const text = expectOk(
      await services().messages.send(ada, { chatId: chat.id, content: 'hi' })
    );
    const missing = {
      ok: false,
      error: { type: 'NotFound', entity: 'Message' },
    };

    expect(
      await services().messages.media(grace, picture.id, 'picture')
    ).toEqual(ok(examplePicture().deflated));
    // Not theirs, not that part, or no media at all: all the same as missing.
    expect(
      await services().messages.media(linus, picture.id, 'picture')
    ).toEqual(missing);
    expect(await services().messages.media(grace, picture.id, 'movie')).toEqual(
      missing
    );
    expect(await services().messages.media(grace, text.id, 'picture')).toEqual(
      missing
    );
    expect(await services().messages.media(grace, 'missing', 'sound')).toEqual(
      missing
    );
  });
});

describe('reading a chat', () => {
  it('marks every message up to the one read, each when it was first read', async () => {
    const { services, deps, ada, grace, chat } = await team();
    const readsOf = (id: Message['id']) =>
      deps.repositories.reads.findByMessageIds([id]);
    const first = expectOk(
      await services().messages.send(ada, { chatId: chat.id, content: 'one' })
    );
    const second = expectOk(
      await services().messages.send(ada, { chatId: chat.id, content: 'two' })
    );

    expectOk(await services().messages.markRead(grace, first.id));
    const [firstRead] = await readsOf(first.id);
    expectOk(await services().messages.markRead(grace, second.id));
    const [secondRead] = await readsOf(second.id);

    expect(firstRead).toEqual({
      messageId: first.id,
      readerId: grace.id,
      at: expect.any(Date),
    });
    expect(await readsOf(first.id)).toEqual([firstRead]);
    expect(Number(secondRead?.at)).toBeGreaterThan(Number(firstRead?.at));
  });

  it("answers for someone else's message exactly as for a missing one", async () => {
    const { services, deps, ada, linus, chat } = await team();
    const hello = expectOk(
      await services().messages.send(ada, { chatId: chat.id, content: 'hi' })
    );

    const theirs = await services().messages.markRead(linus, hello.id);
    const missing = await services().messages.markRead(linus, 'nope');

    expect(theirs).toEqual(missing);
    expect(theirs).toMatchObject({ ok: false, error: { type: 'NotFound' } });
    expect(await services().messages.find(linus, hello.id)).toBeNull();
    expect(await services().messages.find(linus, 'nope')).toBeNull();
    expect(await deps.repositories.reads.findByMessageIds([hello.id])).toEqual(
      []
    );
  });
});

describe('typing', () => {
  it("tells the chat's other participants, and nobody else", async () => {
    const { services, ada, grace, linus, chat } = await team();
    const toGrace = nextEvent(services().messages.typists(grace));
    const toAda = nextEvent(services().messages.typists(ada));
    const toLinus = nextEvent(services().messages.typists(linus));

    expectOk(await services().messages.typing(ada, chat.id));

    expect(await toGrace).toEqual({ chatId: chat.id, user: ada });
    expect(await toAda).toBe('nothing');
    expect(await toLinus).toBe('nothing');
  });

  it("refuses to type into someone else's chat", async () => {
    const { services, linus, grace, chat } = await team();
    const toGrace = nextEvent(services().messages.typists(grace));

    expect(await services().messages.typing(linus, chat.id)).toMatchObject({
      ok: false,
      error: { type: 'NotFound', entity: 'Chat' },
    });
    expect(await toGrace).toBe('nothing');
  });
});
