import "./globals.css";

export const metadata = {
  title: "College Event Recommendation System",
  description: "Discover workshops, cultural fests, sports and more—matched to your interests."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
