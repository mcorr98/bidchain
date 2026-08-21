import { redirect } from "next/navigation";
import { auth } from "@/auth";
import ChangeEmailForm from "@/components/change-email-form";
import ChangePasswordForm from "@/components/change-password-form";
import SectionHeading from "@/components/section-heading";
import { KeyRound, UserRound, Mail } from "lucide-react";

export default async function AccountPage() {
    const session = await auth();
    if (!session || !session.user) {
        redirect("/login");
    }

    return (
        <main className="mx-auto max-w-2xl px-4 py-8">
            <h1 className="mb-6 text-2xl font-semibold text-brand">Account</h1>

            <div className="space-y-6">
                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <SectionHeading icon={UserRound} label="Details" />
                    <p className="text-sm font-medium text-ink">{session.user.name}</p>
                    <p className="text-sm text-gray-500">{session.user.email}</p>
                    <p className="text-xs text-gray-400">
                    </p>
                </div>

                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <SectionHeading icon={Mail} label="Change email address" />
                    <ChangeEmailForm />
                </div>

                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <SectionHeading icon={KeyRound} label="Change password" />
                    <ChangePasswordForm />
                </div>
            </div>
        </main>
    );
}