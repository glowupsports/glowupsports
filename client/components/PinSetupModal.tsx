import React, { useEffect, useState } from "react";
import { Alert } from "react-native";
import { PinPadModal } from "./PinPadModal";
import { PinRecoveryModal } from "./PinRecoveryModal";
import { getApiUrl } from "@/lib/query-client";
import { getAuthToken } from "@/lib/auth";

interface PinSetupModalProps {
  visible: boolean;
  /** True if the caller already has a PIN — flow will ask for current PIN first. */
  hasExistingPin: boolean;
  /** Used for the recovery email pre-fill. */
  callerEmail?: string | null;
  onClose: () => void;
  onComplete: () => void;
}

type Step = "current" | "new" | "confirm";

/**
 * Family B — multi-step PIN setup / change wizard built on top of PinPadModal.
 *
 * Flow when hasExistingPin=true:
 *   current → new → confirm → POST /api/account/pin (currentPin + newPin)
 * Flow when hasExistingPin=false:
 *   new → confirm → POST /api/account/pin (newPin only — server allows
 *   first-time set without currentPin)
 *
 * Each pad is its own modal instance keyed by step so the digits reset
 * cleanly between steps.
 */
export function PinSetupModal({
  visible,
  hasExistingPin,
  callerEmail,
  onClose,
  onComplete,
}: PinSetupModalProps) {
  const [step, setStep] = useState<Step>(hasExistingPin ? "current" : "new");
  const [currentPin, setCurrentPin] = useState<string>("");
  const [newPin, setNewPin] = useState<string>("");
  const [recoveryOpen, setRecoveryOpen] = useState(false);

  useEffect(() => {
    if (visible) {
      setStep(hasExistingPin ? "current" : "new");
      setCurrentPin("");
      setNewPin("");
      setRecoveryOpen(false);
    }
  }, [visible, hasExistingPin]);

  const submitToServer = async (newPinValue: string, currentPinValue: string): Promise<string | null> => {
    try {
      const token = getAuthToken();
      if (!token) return "Not authenticated";
      const url = new URL("/api/account/pin", getApiUrl()).toString();
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          newPin: newPinValue,
          currentPin: currentPinValue || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return null;
      return data?.error || "Could not save PIN";
    } catch (e) {
      return e instanceof Error ? e.message : "Network error";
    }
  };

  const handlePinEntered = async (pin: string): Promise<string | null> => {
    if (step === "current") {
      setCurrentPin(pin);
      setStep("new");
      return null;
    }
    if (step === "new") {
      setNewPin(pin);
      setStep("confirm");
      return null;
    }
    // confirm step
    if (pin !== newPin) {
      setNewPin("");
      setStep("new");
      return "PINs don't match. Try again.";
    }
    const error = await submitToServer(newPin, currentPin);
    if (error) {
      // Reset to start so user can try again from a clean slate.
      setCurrentPin("");
      setNewPin("");
      setStep(hasExistingPin ? "current" : "new");
      return error;
    }
    Alert.alert("PIN saved", "Your account PIN has been updated.");
    onComplete();
    return null;
  };

  const titles: Record<Step, { title: string; subtitle: string }> = {
    current: {
      title: "Enter current PIN",
      subtitle: "Confirm your existing PIN to make changes.",
    },
    new: {
      title: "Set a new 4-digit PIN",
      subtitle: "You'll use this to switch into this account.",
    },
    confirm: {
      title: "Re-enter new PIN",
      subtitle: "Type the same 4 digits again to confirm.",
    },
  };

  return (
    <>
      <PinPadModal
        visible={visible && !recoveryOpen}
        title={titles[step].title}
        subtitle={titles[step].subtitle}
        onSubmit={handlePinEntered}
        onClose={onClose}
        onForgotPin={hasExistingPin && step === "current" ? () => setRecoveryOpen(true) : undefined}
      />
      <PinRecoveryModal
        visible={visible && recoveryOpen}
        defaultEmail={callerEmail || undefined}
        onClose={() => setRecoveryOpen(false)}
      />
    </>
  );
}
