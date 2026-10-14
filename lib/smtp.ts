import net from 'node:net';
import tls, { type TLSSocket } from 'node:tls';
import type { Duplex } from 'node:stream';

type Mail = { to: string; subject: string; text: string; from?: string };

class ReplyReader {
  private buffer = '';
  private waiting: Array<(value: string) => void> = [];
  private lines: string[] = [];
  constructor(private socket: Duplex) {
    socket.on('data', (chunk: Buffer | string) => {
      this.buffer += chunk.toString('utf8');
      while (this.buffer.includes('\r\n')) {
        const i = this.buffer.indexOf('\r\n');
        const line = this.buffer.slice(0, i); this.buffer = this.buffer.slice(i + 2); this.lines.push(line);
      }
      this.flush();
    });
    socket.on('error', () => this.flush());
    socket.on('close', () => this.flush());
  }
  private flush() {
    while (this.waiting.length && this.lines.length) {
      const waiter = this.waiting.shift()!;
      const result: string[] = [];
      while (this.lines.length) {
        const line = this.lines.shift()!; result.push(line);
        if (/^\d{3} /.test(line)) break;
      }
      if (result.length && !/^\d{3} /.test(result[result.length - 1])) { this.lines = [...result, ...this.lines]; this.waiting.unshift(waiter); return; }
      waiter(result.join('\n'));
    }
  }
  read(timeoutMs = 8000): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { const i = this.waiting.indexOf(done); if (i >= 0) this.waiting.splice(i, 1); reject(new Error('smtp_timeout')); }, timeoutMs);
      const done = (value: string) => { clearTimeout(timer); resolve(value); };
      this.waiting.push(done); this.flush();
    });
  }
}

function address(value: string) {
  const match = value.match(/^(?:[^<>\r\n]*<)?([^<>\s]+@[^<>\s]+)>?$/);
  if (!match || /[\r\n]/.test(value)) throw new Error('smtp_invalid_address');
  return match[1];
}
function expect(reply: string, codes: number[]) {
  const code = Number(reply.slice(0, 3));
  if (!codes.includes(code)) throw new Error(`smtp_rejected_${Number.isFinite(code) ? code : 'unknown'}`);
}

/** Optional SMTP transport using implicit TLS (465) or mandatory STARTTLS (normally 587). */
export async function sendSmtpMail(mail: Mail): Promise<boolean> {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const username = process.env.SMTP_USER || '';
  const password = process.env.SMTP_PASS || '';
  const from = mail.from || process.env.SMTP_FROM || process.env.CONTACT_FROM_EMAIL || '';
  const to = address(mail.to);
  const fromAddress = address(from);
  if (!host || !username || !password || !from || ![465, 587].includes(port)) return false;
  if (/[\r\n]/.test(mail.subject) || mail.subject.length > 180 || mail.text.length > 40_000) throw new Error('smtp_invalid_message');

  let socket: net.Socket | TLSSocket;
  if (port === 465) socket = tls.connect({ host, port, servername: host, rejectUnauthorized: true });
  else socket = net.createConnection({ host, port });
  socket.setTimeout(12_000, () => socket.destroy(new Error('smtp_timeout')));
  const connected = new Promise<void>((resolve, reject) => { socket.once(port === 465 ? 'secureConnect' : 'connect', resolve); socket.once('error', reject); });
  await connected;
  let reader = new ReplyReader(socket);
  const command = async (line: string, codes: number[]) => { socket.write(`${line}\r\n`); const reply = await reader.read(); expect(reply, codes); return reply; };
  try {
    expect(await reader.read(), [220]);
    await command(`EHLO ${host.replace(/[^a-zA-Z0-9.-]/g, '')}`, [250]);
    if (port === 587) {
      await command('STARTTLS', [220]);
      const upgraded = tls.connect({ socket: socket as net.Socket, servername: host, rejectUnauthorized: true });
      await new Promise<void>((resolve, reject) => { upgraded.once('secureConnect', resolve); upgraded.once('error', reject); });
      socket = upgraded; socket.setTimeout(12_000, () => socket.destroy(new Error('smtp_timeout'))); reader = new ReplyReader(socket);
      await command(`EHLO ${host.replace(/[^a-zA-Z0-9.-]/g, '')}`, [250]);
    }
    await command('AUTH LOGIN', [334]);
    await command(Buffer.from(username).toString('base64'), [334]);
    await command(Buffer.from(password).toString('base64'), [235]);
    await command(`MAIL FROM:<${fromAddress}>`, [250]);
    await command(`RCPT TO:<${to}>`, [250, 251]);
    await command('DATA', [354]);
    const subject = `=?UTF-8?B?${Buffer.from(mail.subject).toString('base64')}?=`;
    const body = Buffer.from(mail.text, 'utf8').toString('base64').match(/.{1,76}/g)?.join('\r\n') || '';
    const safeFrom = from.replace(/[\r\n]/g, '');
    const data = [`From: ${safeFrom}`, `To: <${to}>`, `Subject: ${subject}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', body, '.'].join('\r\n').replace(/\r\n\./g, '\r\n..');
    socket.write(`${data}\r\n`); expect(await reader.read(), [250]);
    await command('QUIT', [221]);
    return true;
  } finally { socket.destroy(); }
}
