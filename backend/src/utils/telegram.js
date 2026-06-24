export class TelegramNotifier {
  constructor(botToken) {
    this.botToken = botToken;
    this.chatId = process.env.TELEGRAM_CHAT_ID || null;
    this.baseUrl = `https://api.telegram.org/bot${botToken}`;
  }

  async sendAlert(message) {
    if (!this.botToken) {
      console.log('[Telegram] No bot token - skipping alert');
      console.log(message);
      return;
    }
    
    try {
      const url = `${this.baseUrl}/sendMessage`;
      const chatId = this.chatId || (await this.getUpdates())[0]?.message?.chat?.id;
      
      if (!chatId) {
        console.log('[Telegram] No chat ID found. Send a message to your bot first.');
        return;
      }
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'Markdown'
        })
      });
      
      const data = await response.json();
      if (data.ok) {
        console.log('[Telegram] Alert sent');
      } else {
        console.error('[Telegram] Send error:', data);
      }
    } catch (err) {
      console.error('[Telegram] Error:', err.message);
    }
  }

  async getUpdates() {
    try {
      const response = await fetch(`${this.baseUrl}/getUpdates`);
      const data = await response.json();
      return data.result || [];
    } catch {
      return [];
    }
  }

  async sendTradeAlert(trade) {
    const emoji = trade.pnl > 0 ? '✅' : '❌';
    const message = `${emoji} *Trade ${trade.status}*\n` +
      `Pair: ${trade.pair}\n` +
      `Direction: ${trade.direction.toUpperCase()}\n` +
      `Entry: $${trade.entryPrice.toFixed(4)}\n` +
      `${trade.exitPrice ? `Exit: $${trade.exitPrice.toFixed(4)}\n` : ''}` +
      `PnL: $${(trade.pnl || 0).toFixed(2)}\n` +
      `Reason: ${trade.closeReason || 'Open'}`;
    
    await this.sendAlert(message);
  }

  async sendError(error) {
    await this.sendAlert(`🚨 *ERROR*\n${error}`);
  }
}
