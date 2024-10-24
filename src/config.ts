import { ConfigFramework, DiscordOptions } from '@book000/node-utils'

export interface IConfiguration {
  /** Discord webhook URL or bot token */
  discord: DiscordOptions
}

export class Configuration extends ConfigFramework<IConfiguration> {
  protected validates(): Record<string, (config: IConfiguration) => boolean> {
    return {
      'discord is required': (options) => 'discord' in options,
      'discord is object': (options) => typeof options.discord === 'object',
      // token と channelId または、webhookUrl が必要
      'discord.token and discord.channelId or discord.webhookUrl is required': (
        options
      ) =>
        ('token' in options.discord && 'channelId' in options.discord) ||
        'webhookUrl' in options.discord,
      'discord.token is string': (options) =>
        !('token' in options.discord) ||
        typeof options.discord.token === 'string',
      'discord.channelId is string': (options) =>
        !('channelId' in options.discord) ||
        typeof options.discord.channelId === 'string',
      'discord.webhookUrl is string': (options) =>
        !('webhookUrl' in options.discord) ||
        typeof options.discord.webhookUrl === 'string',
    }
  }
}
