import "./styles.css";

export const metadata = {
  title: "Social Listeting",
  description: "A tiny frontend connected to a Railway worker."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
