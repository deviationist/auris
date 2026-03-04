import { redirect } from "next/navigation";
import { isAuthEnabled } from "@/lib/auth-config";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage() {
  if (!(await isAuthEnabled())) {
    redirect("/");
  }

  return (
    <main id="main" className="flex min-h-svh items-center justify-center p-4">
      <LoginForm />
    </main>
  );
}
