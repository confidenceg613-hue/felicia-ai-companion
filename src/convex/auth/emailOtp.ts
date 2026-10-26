import { Phone } from "@convex-dev/auth/providers/Phone";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";
import twilio from "twilio";

export const phoneOtp = Phone({
  id: "phone-otp",
  maxAge: 60 * 15,
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes: Uint8Array) {
        crypto.getRandomValues(bytes);
      },
    };
    const alphabet = "0123456789";
    return generateRandomString(random, alphabet, 6);
  },
  async sendVerificationRequest({ identifier: phoneNumber, token }) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !from) {
      throw new Error(
        "Twilio SMS config is incomplete. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER.",
      );
    }

    const client = twilio(accountSid, authToken);
    try {
      await client.messages.create({
        body: `Your Felicia verification code is ${token}`,
        from,
        to: phoneNumber,
      });
    } catch (error) {
      throw twilioSmsError(error);
    }
  },
});

function twilioSmsError(error: unknown): Error {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: number }).status;
    const message =
      error instanceof Error
        ? error.message
        : typeof (error as { message?: string }).message === "string"
          ? (error as { message?: string }).message
          : "Unknown Twilio error";
    return new Error(`Could not send the verification SMS (HTTP ${status ?? "unknown"}): ${message}`);
  }

  return new Error(
    error instanceof Error ? error.message : "Could not send the verification SMS.",
  );
}
