import "./globals.css";
export const metadata={title:"TasteTrail",description:"A reading list that follows your curiosity."};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body><header><strong>TasteTrail<span style={{color:'#6f8d73'}}> ↗</span></strong><a href="/signin-with-chatgpt?return_to=/" target="_top">Sign in with ChatGPT</a></header>{children}</body></html>}
