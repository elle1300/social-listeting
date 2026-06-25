import { postSlackText } from "./slack";

async function main(): Promise<void> {
  await postSlackText(
    [
      "Mailbox.bot social listening smoke test",
      "Slack delivery is configured.",
      `Time: ${new Date().toISOString()}`,
      "This test does not call X or Supabase."
    ].join("\n")
  );
  console.log("Slack smoke test posted");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
