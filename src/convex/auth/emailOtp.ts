import { Email } from "@convex-dev/auth/providers/Email";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";
import { vly } from "../../lib/vly-integrations";

/**
 * Sign-in by emailed one-time code.
 *
 * The card in the app asks for a six-digit code, so the token is generated
 * here instead of leaving Convex Auth's 32-character default — a code that
 * could never be typed into six slots. Email() itself only carries
 * `sendVerificationRequest` through, so the id and the generator are set
 * alongside it.
 */
const emailProvider = Email({
  maxAge: 60 * 15,
  async sendVerificationRequest({ identifier: email, token }) {
    const result = await vly.email.send({
      to: email,
      subject: `Your Felicia sign-in code: ${token}`,
      text: `Your Felicia code is ${token}. It expires in 15 minutes. If you didn't ask to sign in, ignore this email.`,
      html: `
        <div style="background:#fbf7f2;padding:32px 16px;font-family:Georgia,'Times New Roman',serif;color:#241a2b">
          <div style="max-width:440px;margin:0 auto;background:#ffffff;border:1px solid #e8ddd4;border-radius:20px;padding:32px">
            <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#9b6a5a">Felicia</p>
            <h1 style="margin:0 0 16px;font-size:22px;font-weight:600">Here's your code</h1>
            <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#5b4f5f">
              Type this in to finish signing in. It works once, and expires in 15 minutes.
            </p>
            <p style="margin:0 0 20px;font-size:32px;letter-spacing:0.32em;font-weight:600;color:#241a2b">${token}</p>
            <p style="margin:0;font-size:12px;line-height:1.6;color:#8a7d8d">
              If you didn't ask to sign in, you can ignore this email.
            </p>
          </div>
        </div>
      `,
    });

    if (!result.success) {
      throw new Error(
        result.error ?? "The sign-in code could not be emailed. Please try again.",
      );
    }
  },
});

export const emailOtp = {
  ...emailProvider,
  id: "email-otp",
  // Email() hard-codes its own hour; the code and the email promise 15 minutes.
  maxAge: 60 * 15,
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes: Uint8Array) {
        crypto.getRandomValues(bytes);
      },
    };
    return generateRandomString(random, "0123456789", 6);
  },
};
