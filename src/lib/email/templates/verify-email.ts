export function verifyEmailTemplate(confirmUrl: string) {
  return {
    subject: "Verify your Tomame account",
    html: `
      <h2>Welcome to Tomame!</h2>
      <p>Click the link below to verify your email address:</p>
      <p><a href="${confirmUrl}">Verify Email</a></p>
      <p>If you didn't create this account, you can ignore this email.</p>
    `,
  };
}
