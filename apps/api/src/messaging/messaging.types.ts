export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface SmsMessage {
  /** 10-digit Indian mobile number. */
  to: string;
  text: string;
}

export type SentMessage = ({ kind: 'email' } & EmailMessage) | ({ kind: 'sms' } & SmsMessage);
