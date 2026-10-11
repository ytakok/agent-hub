import { Global, Logger, Module, ServiceUnavailableException } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { AppConfig } from '../config/app-config.service.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Outgoing email. Chosen by configuration, not DATA_MODE: real users need real mail even when integrations are mocked. */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export const MAILER = Symbol('MAILER');

class SmtpMailer implements Mailer {
  constructor(
    private readonly transport: Transporter,
    private readonly from: string,
  ) {}

  async send(m: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...m });
  }
}

/** Local development without SMTP: the message (including any code) is printed to the API console only. */
class ConsoleMailer implements Mailer {
  private readonly logger = new Logger('Mailer');

  async send(m: MailMessage): Promise<void> {
    this.logger.warn(`[dev, no SMTP_HOST] email to ${m.to} — ${m.subject}\n${m.text}`);
  }
}

/** Production without SMTP: fail loudly instead of pretending the email went out. */
class UnconfiguredMailer implements Mailer {
  async send(): Promise<void> {
    throw new ServiceUnavailableException('Email is not configured');
  }
}

export function createMailer(config: AppConfig): Mailer {
  const host = config.get('SMTP_HOST');
  if (host) {
    const port = config.get('SMTP_PORT');
    const user = config.get('SMTP_USER');
    const transport = createTransport({
      host,
      port,
      secure: port === 465,
      auth: user ? { user, pass: config.get('SMTP_PASS') } : undefined,
    });
    return new SmtpMailer(transport, config.get('MAIL_FROM') ?? user ?? 'no-reply@localhost');
  }
  return config.get('NODE_ENV') === 'production' ? new UnconfiguredMailer() : new ConsoleMailer();
}

@Global()
@Module({
  providers: [{ provide: MAILER, inject: [AppConfig], useFactory: createMailer }],
  exports: [MAILER],
})
export class MailerModule {}
