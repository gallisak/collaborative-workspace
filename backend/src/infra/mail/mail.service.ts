import { Injectable, Logger } from '@nestjs/common';

export interface MailMessage {
  to: string;
  subject: string;
  link: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  send(message: MailMessage) {
    this.logger.log({ to: message.to, subject: message.subject, link: message.link }, 'Mail sent');
  }
}
