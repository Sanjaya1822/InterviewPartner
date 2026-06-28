import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { User, Lock, Loader2, CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuthStore } from "@/stores/auth.store";
import { authApi } from "@/services/api";

const pwSchema = z
  .object({
    current_password: z.string().min(1),
    new_password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
    confirm_password: z.string(),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: "Passwords don't match",
    path: ["confirm_password"],
  });

type PwForm = z.infer<typeof pwSchema>;

export default function SettingsPage() {
  const { user } = useAuthStore();
  const [pwSuccess, setPwSuccess] = useState(false);

  const {
    register, handleSubmit, reset,
    formState: { errors, isSubmitting },
  } = useForm<PwForm>({ resolver: zodResolver(pwSchema) });

  const onPwSubmit = async (data: PwForm) => {
    try {
      await authApi.changePassword(data.current_password, data.new_password);
      toast.success("Password changed");
      reset();
      setPwSuccess(true);
      setTimeout(() => setPwSuccess(false), 3000);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Password change failed");
    }
  };

  const initials = user?.full_name
    ? user.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user?.username?.[0]?.toUpperCase() || "U";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-normal text-[#1e1230]">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account preferences</p>
      </div>

      {/* Profile card */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4 text-brand-400" /> Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={user?.avatar_url || undefined} />
                <AvatarFallback className="bg-brand-500/20 text-brand-400 text-lg font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold">{user?.full_name || user?.username}</p>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
                <p className="text-xs text-muted-foreground mt-0.5">@{user?.username}</p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>Full Name</Label>
                <Input defaultValue={user?.full_name || ""} className="mt-1.5" disabled />
              </div>
              <div>
                <Label>Username</Label>
                <Input defaultValue={user?.username || ""} className="mt-1.5" disabled />
              </div>
              <div className="sm:col-span-2">
                <Label>Email</Label>
                <Input defaultValue={user?.email || ""} className="mt-1.5" disabled />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Profile editing coming soon.</p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Password card */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="h-4 w-4 text-brand-400" /> Change Password
            </CardTitle>
          </CardHeader>
          <CardContent>
            {user && !user.avatar_url?.includes("googleuser") ? (
              <form onSubmit={handleSubmit(onPwSubmit)} className="space-y-4">
                <div>
                  <Label>Current Password</Label>
                  <Input type="password" className="mt-1.5" {...register("current_password")} />
                  {errors.current_password && (
                    <p className="text-xs text-destructive mt-1">{errors.current_password.message}</p>
                  )}
                </div>
                <div>
                  <Label>New Password</Label>
                  <Input type="password" placeholder="Min 8 chars, 1 uppercase, 1 number" className="mt-1.5" {...register("new_password")} />
                  {errors.new_password && (
                    <p className="text-xs text-destructive mt-1">{errors.new_password.message}</p>
                  )}
                </div>
                <div>
                  <Label>Confirm New Password</Label>
                  <Input type="password" className="mt-1.5" {...register("confirm_password")} />
                  {errors.confirm_password && (
                    <p className="text-xs text-destructive mt-1">{errors.confirm_password.message}</p>
                  )}
                </div>
                <Button type="submit" disabled={isSubmitting} className="gap-2">
                  {isSubmitting ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Changing…</>
                  ) : pwSuccess ? (
                    <><CheckCircle2 className="h-4 w-4 text-green-500" />Changed!</>
                  ) : (
                    "Change Password"
                  )}
                </Button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                You signed in with Google. Password management is handled by Google.
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
