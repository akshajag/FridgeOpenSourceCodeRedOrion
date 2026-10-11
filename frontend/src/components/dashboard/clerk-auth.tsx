"use client";

import dynamic from "next/dynamic";

/** Clerk's prebuilt components are loaded lazily so unconfigured deployments never ship them. */
export const ClerkSignIn = dynamic(() => import("@clerk/nextjs").then((m) => m.SignIn), { ssr: false });
export const ClerkSignUp = dynamic(() => import("@clerk/nextjs").then((m) => m.SignUp), { ssr: false });
