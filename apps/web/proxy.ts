import { auth } from "@/auth";

export default auth;
export { auth as proxy };

export const proxyConfig = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
