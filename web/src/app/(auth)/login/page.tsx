import type { Metadata } from "next";
import Link from "next/link";
import { Shield } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata: Metadata = {
  title: "Login | Bissbilanz",
  description: "Access your Bissbilanz workspace with your account credentials.",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-blue-50 via-white to-slate-100 px-6 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Shield className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>
              Sign in with your email and password to continue.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@example.com" required autoComplete="email" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link href="#" className="text-sm font-medium text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
              <Input id="password" type="password" required autoComplete="current-password" />
            </div>
            <Button type="submit" className="w-full">
              Sign in
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col space-y-2 text-center text-sm text-muted-foreground">
          <span>
            By continuing you agree to our{" "}
            <Link href="#" className="font-medium text-primary hover:underline">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="#" className="font-medium text-primary hover:underline">
              Privacy Policy
            </Link>
            .
          </span>
          <span>
            Don't have an account?{" "}
            <Link href="#" className="font-medium text-primary hover:underline">
              Sign up
            </Link>
          </span>
        </CardFooter>
      </Card>
    </div>
  );
}
