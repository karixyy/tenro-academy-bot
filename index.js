
require("dotenv").config();

const {
  Client, GatewayIntentBits, REST, Routes,
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  Events, PermissionFlagsBits
} = require("discord.js");

const {
  DISCORD_TOKEN, CLIENT_ID, GUILD_ID,
  STAFF_CHANNEL_ID, APPROVED_ROLE_ID
} = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID ||
    !STAFF_CHANNEL_ID || !APPROVED_ROLE_ID) {
  console.error("Confira as variáveis do arquivo .env.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// Respostas temporárias enquanto o jogador preenche o formulário.
// Elas ficam na memória e são perdidas se o bot reiniciar.
const candidaturas = new Map();

const perguntas = [
  [
    "Qual é o seu nome e qual é a sua idade?",
    "Você já participou de algum RP anteriormente?",
    "O que você entende por Roleplay (RP)?",
    "Ação do jogador vs. do personagem?",
    "O que fazer se quebrarem as regras numa cena?"
  ],
  [
    "Você está disposto a respeitar a todos?",
    "O que é RDM?",
    "O que é MG (Meta Gaming)?",
    "O que é PG (Power Gaming)?",
    "O que é RK (Revenge Kill)?"
  ],
  [
    "O que é Fear RP?",
    "O que é Combat Logging?",
    "O que é Dark RP?",
    "O que é Forçar RP?",
    "O que é Anti-RP?"
  ]
];

const ids = [
  ["nome_idade", "experiencia", "conceito_rp", "jogador_personagem", "quebra_regras"],
  ["respeito", "rdm", "mg", "pg", "rk"],
  ["fear_rp", "combat_logging", "dark_rp", "forcar_rp", "anti_rp"]
];

function criarModal(etapa) {
  const modal = new ModalBuilder()
    .setCustomId(`wl_form_${etapa}`)
    .setTitle(`Whitelist — Etapa ${etapa}/3`);

  const campos = perguntas[etapa - 1].map((pergunta, i) => {
    const campo = new TextInputBuilder()
      .setCustomId(ids[etapa - 1][i])
     .setLabel(pergunta.length > 45 ? pergunta.slice(0, 45) : pergunta)
.setPlaceholder(pergunta.length > 100 ? pergunta.slice(0, 100) : pergunta)
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(1000);

    if (etapa === 1 && i === 0) {
      campo.setPlaceholder("Informe seu nome e sua idade.");
    } else {
      campo.setPlaceholder("Escreva sua resposta...");
    }

    return new ActionRowBuilder().addComponents(campo);
  });

  modal.addComponents(...campos);
  return modal;
}

const commands = [
  new SlashCommandBuilder()
    .setName("painel")
    .setDescription("Publica o painel da whitelist")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
].map(command => command.toJSON());

async function registrarComandos() {
  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

  const rota = GUILD_ID
    ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
    : Routes.applicationCommands(CLIENT_ID);

  await rest.put(rota, { body: commands });
  console.log("Comando /painel registrado!");
}

client.once(Events.ClientReady, async () => {
  console.log(`Bot online: ${client.user.tag}`);

  try {
    await registrarComandos();
  } catch (error) {
    console.error("Erro ao registrar comandos:", error);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    // Comando para publicar o painel
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName !== "painel") return;

      const embed = new EmbedBuilder()
        .setColor(0x7B5CFF)
        .setTitle("📋 WHITELIST — RP")
        .setDescription(
          "Para participar do RP, clique no botão abaixo.\n\n" +
          "Você responderá a 15 perguntas divididas em três etapas. " +
          "A staff analisará sua candidatura após o envio."
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("fazer_whitelist")
          .setLabel("Fazer Whitelist")
          .setEmoji("📝")
          .setStyle(ButtonStyle.Primary)
      );

      return interaction.reply({
        embeds: [embed],
        components: [row]
      });
    }

    if (!interaction.isButton() && !interaction.isModalSubmit()) return;

    // Iniciar ou continuar o formulário
    if (interaction.isButton()) {
      if (interaction.customId === "fazer_whitelist") {
        candidaturas.set(interaction.user.id, []);
        return interaction.showModal(criarModal(1));
      }

      if (interaction.customId === "wl_continuar_2") {
        return interaction.showModal(criarModal(2));
      }

      if (interaction.customId === "wl_continuar_3") {
        return interaction.showModal(criarModal(3));
      }
    }

    // Guardar as respostas de cada etapa
    if (
      interaction.isModalSubmit() &&
      interaction.customId.startsWith("wl_form_")
    ) {
      const etapa = Number(interaction.customId.slice(-1));

      if (![1, 2, 3].includes(etapa)) return;

      if (etapa > 1 && !candidaturas.has(interaction.user.id)) {
        return interaction.reply({
          content: "Sua candidatura expirou. Clique em Fazer Whitelist para começar novamente.",
          ephemeral: true
        });
      }

      const respostas = candidaturas.get(interaction.user.id) || [];

      perguntas[etapa - 1].forEach((pergunta, i) => {
        respostas[(etapa - 1) * 5 + i] =
          interaction.fields.getTextInputValue(ids[etapa - 1][i]);
      });

      candidaturas.set(interaction.user.id, respostas);

      if (etapa < 3) {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`wl_continuar_${etapa + 1}`)
            .setLabel(`Continuar para etapa ${etapa + 1}`)
            .setStyle(ButtonStyle.Primary)
        );

        return interaction.reply({
          content: `✅ Etapa ${etapa}/3 concluída! Clique para continuar.`,
          components: [row],
          ephemeral: true
        });
      }

      await interaction.deferReply({ ephemeral: true });

      const channel = await client.channels.fetch(STAFF_CHANNEL_ID);

      if (!channel || !channel.isTextBased()) {
        return interaction.editReply(
          "Não encontrei o canal da staff. Avise um administrador."
        );
      }

      const embed = new EmbedBuilder()
        .setColor(0xF0B232)
        .setTitle("📥 Nova candidatura de whitelist")
        .setDescription(
          `**Candidato:** ${interaction.user.tag}\n` +
          `**ID:** ${interaction.user.id}`
        )
        .setTimestamp();

      respostas.forEach((resposta, i) => {
        embed.addFields({
          name: `${i + 1}. ${perguntas[Math.floor(i / 5)][i % 5]}`,
          value: resposta.slice(0, 1024)
        });
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`wl_aprovar:${interaction.user.id}`)
          .setLabel("Aprovar")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`wl_reprovar:${interaction.user.id}`)
          .setLabel("Reprovar")
          .setStyle(ButtonStyle.Danger)
      );

      await channel.send({ embeds: [embed], components: [row] });
      candidaturas.delete(interaction.user.id);

      return interaction.editReply(
        "✅ Sua candidatura foi enviada para a staff! Aguarde o resultado."
      );
    }

    // Decisão da staff
    if (
      interaction.isButton() &&
      /^(wl_aprovar|wl_reprovar):\d+$/.test(interaction.customId)
    ) {
      if (
        !interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)
      ) {
        return interaction.reply({
          content: "Você não tem permissão para avaliar candidaturas.",
          ephemeral: true
        });
      }

      const [acao, userId] = interaction.customId.split(":");

      if (acao === "wl_aprovar") {
        const membro = await interaction.guild.members
          .fetch(userId).catch(() => null);

        if (!membro) {
          return interaction.reply({
            content: "O candidato não está mais no servidor.",
            ephemeral: true
          });
        }

        await membro.roles.add(
          APPROVED_ROLE_ID,
          `Whitelist aprovada por ${interaction.user.tag}`
        );

        await interaction.update({
          embeds: [
            EmbedBuilder.from(interaction.message.embeds[0])
              .setColor(0x2ECC71)
              .setTitle("✅ Whitelist aprovada")
              .addFields({
                name: "Avaliado por",
                value: interaction.user.tag
              })
          ],
          components: []
        });

        try {
          await membro.send("🎉 Sua whitelist foi aprovada! Bem-vindo ao RP.");
        } catch {}

        return;
      }

      await interaction.update({
        embeds: [
          EmbedBuilder.from(interaction.message.embeds[0])
            .setColor(0xE74C3C)
            .setTitle("❌ Whitelist reprovada")
            .addFields({
              name: "Avaliado por",
              value: interaction.user.tag
            })
        ],
        components: []
      });

      const usuario = await client.users.fetch(userId).catch(() => null);

      if (usuario) {
        try {
          await usuario.send(
            "Sua whitelist foi reprovada. Consulte a staff sobre a possibilidade de tentar novamente."
          );
        } catch {}
      }
    }
  } catch (error) {
    console.error("Erro na interação:", error);

    if (interaction.isRepliable() &&
        !interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "Ocorreu um erro. Avise a staff.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

client.login(DISCORD_TOKEN).catch(error => {
  console.error("Erro ao conectar o bot:", error.message);
});
