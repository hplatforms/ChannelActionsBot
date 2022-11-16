/*
ChannelActions Bot
Telegram: @ChannelActionsBot

(c) Aditya, https://xditya.me
*/

import config from "./env.ts";
import { get_perms } from "./helpers.ts";
import {
  addUser,
  countUsers,
  getAllSettings,
  getSettings,
  setStatus,
  setWelcome,
} from "./db.ts";

import {
  Bot,
  Context,
  GrammyError,
  HttpError,
  InlineKeyboard,
  session,
  SessionFlavor,
} from "grammy/mod.ts";
import { hydrate, HydrateFlavor } from "hydrate";
import {
  type Conversation,
  type ConversationFlavor,
  conversations,
  createConversation,
} from "conversations";
import { I18n, I18nFlavor } from "i18n";
import { freeStorage } from "https://deno.land/x/grammy_storages@v2.0.1/free/src/mod.ts";

interface SessionData {
  __language_code?: string;
}
export type MyContext = HydrateFlavor<
  Context & SessionFlavor<SessionData> & I18nFlavor & ConversationFlavor
>;
type MyConversation = Conversation<MyContext>;

export const bot = new Bot<MyContext>(config.BOT_TOKEN);
const i18n = new I18n<MyContext>({
  defaultLocale: "en",
  useSession: true,
});

await i18n.loadLocalesDir("locales");

bot.use(hydrate());
bot.use(session({ initial: () => ({}), storage: freeStorage(bot.token) }));
bot.use(i18n);
bot.use(conversations());
bot.use(createConversation(inputWelcomeMsg));

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error("Error in request:", e.description);
  } else if (e instanceof HttpError) {
    console.error("Could not contact Telegram:", e);
  } else {
    console.error("Unknown error:", e);
  }
});

const owners: number[] = [];
for (const owner of config.OWNERS.split(" ")) {
  owners.push(Number(owner));
}

bot.callbackQuery(/set_locale_(.*)/, async (ctx) => {
  const i = ctx.match?.[0];
  if (!i || i == undefined) return;
  await ctx.editMessageText(`Locale changed to ${i}`);
  await ctx.i18n.setLocale(i);
});

bot
  .chatType("private")
  .command("start", async (ctx) => {
    await ctx.reply(ctx.t("start-msg", { user: ctx.from.first_name }), {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .text(ctx.t("usage-help"), "helper").row()
        .url(ctx.t("updates"), "https://t.me/dublajflix"),
      disable_web_page_preview: true,
    });
    await addUser(ctx.from.id);
  });

bot.callbackQuery("helper", async (ctx) => {
  await ctx.editMessageText(
    ctx.t("help") +
      "\n\nHalihazırda bekleme listesinde olan üyeleri onaylamak için ayda 3$ ödeyerek premium üye olun!  İlgileniyorsanız @xditya_bot ile iletişime geçin.",
    {
      reply_markup: new InlineKeyboard().text("Ana Menü 📭", "start"),
      parse_mode: "HTML",
    },
  );
});

bot.callbackQuery("start", async (ctx) => {
  try {
    await ctx.editMessageText(
      ctx.t("start-msg", { user: ctx.from.first_name }),
      {
        reply_markup: new InlineKeyboard()
          .text(ctx.t("usage-help"), "helper").row()
          .url(ctx.t("updates"), "https://t.me/dublajflix"),
        disable_web_page_preview: true,
        parse_mode: "HTML",
      },
    );
  } catch (e) {
    console.error(e);
  }
});

bot
  .chatType("private")
  .filter((ctx) =>
    !ctx.msg?.text?.startsWith("/") &&
    ctx.msg?.forward_from_chat?.type == "channel"
  )
  .on("message", async (ctx) => {
    const chat = ctx.msg?.forward_from_chat?.id;
    if (chat == undefined) return;
    const res = await get_perms(bot, chat, ctx.from.id);
    if (res == null) {
      return await ctx.reply(
        ctx.t("no-perms"),
      );
    }
    if (!res) return await ctx.reply(ctx.t("not-admin"));
    const chatInfo = await bot.api.getChat(chat);
    if (chatInfo.type == "private") return;
    const current_settings = await getSettings(chat);
    let autoappr;
    if (current_settings == null) autoappr = true;
    else autoappr = current_settings.status ?? true;
    const settings_buttons = new InlineKeyboard()
      .text(ctx.t("btn-approve"), `approve_${chat}`).row()
      .text(ctx.t("btn-disapprove"), `decline_${chat}`).row()
      .text(ctx.t("btn-custom"), `welcome_${chat}`);
    await ctx.reply(
      ctx.t("chat-settings", {
        title: chatInfo.title,
        autoappr: autoappr.toString(),
      }),
      {
        reply_markup: settings_buttons,
        parse_mode: "Markdown",
      },
    );
  });

bot.callbackQuery(/settings_page_(.*)/, async (ctx) => {
  const chat = ctx.match?.[1];
  if (chat == undefined) return;
  const chatInfo = await bot.api.getChat(Number(chat));
  if (chatInfo.type == "private") return;
  const current_settings = await getSettings(Number(chat));
  let autoappr;
  if (current_settings == null) autoappr = true;
  else autoappr = current_settings.status ?? true;
  const settings_buttons = new InlineKeyboard()
    .text(ctx.t("btn-approve"), `approve_${chat}`).row()
    .text(ctx.t("btn-disapprove"), `decline_${chat}`).row()
    .text(ctx.t("btn-custom"), `welcome_${chat}`);
  await ctx.editMessageText(
    ctx.t("chat-settings", {
      title: chatInfo.title,
      autoappr: autoappr.toString(),
    }),
    {
      reply_markup: settings_buttons,
      parse_mode: "Markdown",
    },
  );
});

bot.callbackQuery(/approve_(.*)/, async (ctx) => {
  const chatID = ctx.match?.[1];
  if (chatID == undefined) return;
  await setStatus(Number(chatID), true);
  const chatInfo = await bot.api.getChat(Number(chatID));
  if (chatInfo.type == "private") return;
  await ctx.editMessageText(
    ctx.t("chat-settings-approved", { title: chatInfo.title }),
    {
      reply_markup: new InlineKeyboard().text(
        "Back",
        `settings_page_${chatID}`,
      ),
    },
  );
});

bot.callbackQuery(/decline_(.*)/, async (ctx) => {
  const chatID = ctx.match?.[1];
  if (chatID == undefined) return;
  await setStatus(Number(chatID), false);
  const chatInfo = await bot.api.getChat(Number(chatID));
  if (chatInfo.type == "private") return;
  await ctx.editMessageText(
    ctx.t("chat-settings-disapproved", { title: chatInfo.title }),
    {
      reply_markup: new InlineKeyboard().text(
        "Back",
        `settings_page_${chatID}`,
      ),
    },
  );
});

async function inputWelcomeMsg(conversation: MyConversation, ctx: MyContext) {
  const chatID = ctx.match?.[1];
  if (chatID == undefined) return;
  await ctx.editMessageText(
    ctx.t("welcome-text"),
  );
  const { message } = await conversation.waitFor("message:text");
  if (!message.text) {
    return await ctx.reply(ctx.t("provide-msg"), {
      reply_markup: new InlineKeyboard().text(
        "Back",
        `settings_page_${chatID}`,
      ),
    });
  }
  await setWelcome(Number(chatID), message.text);
  await ctx.reply(ctx.t("welcome-set", { msg: message.text }), {
    reply_markup: new InlineKeyboard().text(
      "Back",
      `settings_page_${chatID}`,
    ),
  });
}
bot.callbackQuery(/welcome_(.*)/, async (ctx) => {
  await ctx.conversation.enter("inputWelcomeMsg");
});

bot.on("chat_join_request", async (ctx) => {
  if (!ctx.update.chat_join_request) return;
  const update = ctx.update.chat_join_request;
  const settings = await getSettings(update.chat.id);
  let approve_or_not, welcome;
  const def_welcome_approve =
    "Hey {name}, {chat} katılma isteğin onaylandı!\n\n**@dublajflix**\n**@hdfilmmerkezi**";
  const def_welcome_decline =
    "Hey {name}, {chat} katılma isteğin reddedildi!";

  if (settings == null) {
    approve_or_not = true;
    welcome = def_welcome_approve;
  } else {
    approve_or_not = settings.status;
    if (approve_or_not == true) {
      welcome = settings.welcome ?? def_welcome_approve;
      if (welcome == "") welcome = def_welcome_approve;
    } else {
      welcome = settings.welcome ?? def_welcome_decline;
      if (welcome == "") welcome = def_welcome_decline;
    }
  }

  // try to approve
  try {
    if (approve_or_not) {
      await bot.api.approveChatJoinRequest(update.chat.id, update.from.id);
    } else {
      await bot.api.declineChatJoinRequest(update.chat.id, update.from.id);
    }
  } catch (error) {
    if (error.error_code == 400 || error.error_code == 403) return;
    console.log("Error while approving user: ", error.message);
    return;
  }

  welcome += "\n\nDaha fazlasını görmek için /start yaz!";
  welcome = welcome.replace("{name}", update.from.first_name).replace(
    "{chat}",
    update.chat.title,
  ).replace("$name", update.from.first_name).replace(
    "$chat",
    update.chat.title,
  );

  // try to send a message
  try {
    await bot.api.sendMessage(
      update.from.id,
      welcome,
    );
  } catch (error) {
    if (error.error_code == 403) return;
    console.log("Error while sending a message: ", error.message);
    return;
  }
});

bot
  .filter((ctx) => owners.includes(ctx.from?.id ?? 0))
  .chatType("private")
  .command("stats", async (ctx) => {
    const reply = await ctx.reply("Hesaplanıyor...");
    await bot.api.editMessageText(
      ctx.from.id,
      reply.message_id,
      `Total users: ${await countUsers()}\nChats with modified settings: ${
        (await getAllSettings()).length
      }`,
    );
  });

bot.command("setlang", async (ctx) => {
  let locales = "";
  for (const loc of i18n.locales) locales += "- `" + loc + "`\n";
  if (ctx.match === "") {
    return await ctx.reply(
      "_Bir yerel ayar belirtin!_\n\n*Mevcut yerel ayarlar:*\n" + locales,
      { parse_mode: "Markdown" },
    );
  }

  if (!i18n.locales.includes(ctx.match)) {
    return await ctx.reply(
      "_Geçersiz yerel ayar kodu._\n\n*Mevcut yerel ayarlar:*\n" + locales,
      { parse_mode: "Markdown" },
    );
  }

  if ((await ctx.i18n.getLocale()) === ctx.match) {
    return await ctx.reply(
      `You are already using ${ctx.match} as your locale.`,
    );
  }

  await ctx.i18n.setLocale(ctx.match);
  await ctx.reply(`Locale has been set to ${ctx.match}`);
});

await bot.init();
console.info(`Started Bot - @${bot.botInfo.username}`);
console.info("\nKatılın @dublajflix!\nBy - @hplatformsadmin.\n");
