import "./styles.css";

export const metadata = {
  title: "Mailbox.bot Social Listening",
  description: "A lightweight social listening control page."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
