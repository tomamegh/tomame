export function resetPasswordTemplate(resetUrl: string) {
  return {
    subject: "Reset your Tomame password",
    html: `
      <h2>Password Reset</h2>
      <p>Click the link below to reset your password:</p>
      <p><a href="${resetUrl}">Reset Password</a></p>
      <p>If you didn't request this, you can ignore this email.</p>
    `,
  };
}
