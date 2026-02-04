import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, Check, ArrowLeft } from "lucide-react";
import whiskrMonogram from "@/assets/whiskr-monogram.png";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Footer } from "@/components/layout/Footer";
import { SUBSCRIPTION_TIERS, getPrice, getOriginalPrice, getPriceId } from "@/lib/subscriptionTiers";
import { PasswordStrengthIndicator } from "@/components/auth/PasswordStrengthIndicator";
const VET_SCHOOLS = ["Auburn University", "Colorado State University", "Cornell University", "Iowa State University", "Kansas State University", "Louisiana State University", "Michigan State University", "Mississippi State University", "North Carolina State University", "Ohio State University", "Oklahoma State University", "Oregon State University", "Purdue University", "Texas A&M University", "Tufts University", "Tuskegee University", "University of California, Davis", "University of Florida", "University of Georgia", "University of Illinois", "University of Minnesota", "University of Missouri", "University of Pennsylvania", "University of Tennessee", "University of Wisconsin-Madison", "Virginia-Maryland College", "Washington State University", "Western University of Health Sciences", "University of Guelph", "University of Montreal", "University of Prince Edward Island", "University of Calgary", "University of Saskatchewan", "Royal Veterinary College (UK)", "University of Edinburgh (UK)", "University of Glasgow (UK)", "Utrecht University (Netherlands)", "University of Sydney (Australia)", "Massey University (New Zealand)", "Other"];
const PRACTICE_TYPES = [{
  id: "general",
  label: "General Practice"
}, {
  id: "emergency",
  label: "Emergency"
}, {
  id: "hybrid",
  label: "Hybrid"
}, {
  id: "relief_locum",
  label: "Relief/Locum"
}];
const step1Schema = z.object({
  email: z.string().trim().email("Please enter a valid email address").max(255, "Email too long").regex(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, "Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128, "Password too long").regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "Password must contain uppercase, lowercase, and number"),
  name: z.string().trim().min(1, "Name is required").max(100, "Name too long"),
  phone: z.string().trim().min(10, "Please enter a valid phone number").max(20, "Phone number too long").regex(/^\(\d{3}\)\s\d{3}-\d{4}$/, "Phone number must be in format (XXX) XXX-XXXX").refine(phone => {
    const cleaned = phone.replace(/\D/g, "");
    return cleaned.length === 10;
  }, "Phone number must be exactly 10 digits"),
  selectedPlan: z.enum(["basic", "professional"], {
    required_error: "Please select a plan"
  })
});
const step2Schema = z.object({
  clinicName: z.string().trim().min(1, "Clinic name is required").max(200, "Clinic name too long"),
  userType: z.enum(["dvm", "student"], {
    required_error: "Please select a user type"
  }),
  agreedToTerms: z.boolean().refine(val => val === true, "You must agree to the Terms and Conditions"),
  agreedToPrivacy: z.boolean().refine(val => val === true, "You must agree to the Privacy Policy")
});
export default function Signup() {
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(1);
  const [userId, setUserId] = useState<string | null>(null);

  // Step 1 fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<"basic" | "professional">("basic");
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("yearly");

  // Step 2 fields
  const [clinicName, setClinicName] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [userType, setUserType] = useState<"dvm" | "student" | "">("");

  // Student fields
  const [schoolName, setSchoolName] = useState("");
  const [otherSchool, setOtherSchool] = useState("");

  // DVM fields
  const [country, setCountry] = useState("");
  const [stateProvince, setStateProvince] = useState("");
  const [city, setCity] = useState("");
  const [dvmRole, setDvmRole] = useState("");
  const [practiceTypes, setPracticeTypes] = useState<string[]>([]);

  // AI Autocomplete state
  const [citySuggestions, setCitySuggestions] = useState<Array<{
    city: string;
    state: string;
    country: string;
  }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [loading, setLoading] = useState(false);
  const {
    signUp
  } = useAuth();
  const {
    toast
  } = useToast();
  const navigate = useNavigate();
  const updatePlan = (plan: "basic" | "professional") => {
    console.log("[Signup] updatePlan called with:", plan);
    setSelectedPlan(plan);
    // Update URL without triggering a navigation to avoid re-mount loops
    try {
      const params = new URLSearchParams(window.location.search);
      params.set("plan", plan);
      window.history.replaceState(null, "", `/signup?${params.toString()}`);
    } catch (e) {
      console.warn("Could not update URL params for plan:", e);
    }
  };

  // Format phone number as (XXX) XXX-XXXX
  const formatPhoneNumber = (value: string) => {
    // Remove all non-numeric characters
    const cleaned = value.replace(/\D/g, "");

    // Format as (XXX) XXX-XXXX
    if (cleaned.length <= 3) {
      return cleaned;
    } else if (cleaned.length <= 6) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
    } else {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
    }
  };
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setPhone(formatted);
  };

  // Initialize from URL params on mount only
  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) {
      setReferralCode(ref);
    }
    const planParam = searchParams.get("plan");
    if (planParam === "basic" || planParam === "professional") {
      console.log("[Signup] initializing selectedPlan from URL:", planParam);
      setSelectedPlan(planParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount to initialize from URL

  // Debounced city search
  const handleCityInputChange = (value: string) => {
    setCity(value);
    setShowSuggestions(true);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (value.trim().length < 2) {
      setCitySuggestions([]);
      setShowSuggestions(false);
      return;
    }
    setLoadingSuggestions(true);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const {
          data,
          error
        } = await supabase.functions.invoke("city-autocomplete", {
          body: {
            query: value
          }
        });
        if (error) throw error;
        setCitySuggestions(data?.suggestions || []);
      } catch (error) {
        console.error("Error fetching city suggestions:", error);
        setCitySuggestions([]);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 300);
  };
  const handleCitySuggestionSelect = (suggestion: {
    city: string;
    state: string;
    country: string;
  }) => {
    setCity(suggestion.city);
    setStateProvince(suggestion.state);
    setCountry(suggestion.country);
    setShowSuggestions(false);
    setCitySuggestions([]);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  const generateTags = (): string[] => {
    const tags: string[] = [];
    if (userType === "student") {
      const school = schoolName === "Other" ? otherSchool : schoolName;
      tags.push(`student-${school.toLowerCase().replace(/\s+/g, "-")}`);
    } else if (userType === "dvm") {
      if (dvmRole) {
        tags.push(`dvm-${dvmRole}`);
      }
      practiceTypes.forEach(type => {
        tags.push(`practice-${type}`);
      });
      if (country) tags.push(`region-${country.toLowerCase().replace(/\s+/g, "-")}`);
      if (stateProvince) tags.push(`region-${stateProvince.toLowerCase().replace(/\s+/g, "-")}`);
      if (city) tags.push(`region-${city.toLowerCase().replace(/\s+/g, "-")}`);
    }
    return tags;
  };
  const togglePracticeType = (typeId: string) => {
    setPracticeTypes(prev => prev.includes(typeId) ? prev.filter(t => t !== typeId) : [...prev, typeId]);
  };
  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Validate Step 1 inputs
      const validated = step1Schema.parse({
        email,
        password,
        name,
        phone,
        selectedPlan
      });

      // Create account
      const {
        data,
        error
      } = await signUp(validated.email, validated.password, validated.name, "Temporary Clinic",
      // Will be updated in step 2
      referralCode || undefined);
      if (error) {
        toast({
          variant: "destructive",
          title: "Signup failed",
          description: error.message
        });
        return;
      }

      // Detect existing account case: Supabase returns user with empty identities
      if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        toast({
          variant: "destructive",
          title: "Account already exists",
          description: "An account with this email already exists. Please log in or reset your password."
        });
        navigate(`/login?email=${encodeURIComponent(validated.email)}`);
        return;
      }
      if (data?.user) {
        setUserId(data.user.id);

        // Update phone
        await supabase.from("profiles").update({
          phone
        }).eq("user_id", data.user.id);
        toast({
          title: "Account created!",
          description: "Please check your email for a verification link, then complete your professional information."
        });
        setStep(2);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          variant: "destructive",
          title: "Validation error",
          description: error.errors[0].message
        });
      } else if (error instanceof Error) {
        toast({
          variant: "destructive",
          title: "Error",
          description: error.message
        });
      }
    } finally {
      setLoading(false);
    }
  };
  const handleStep2Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Guardrail: nudge user to select autocomplete suggestion
    if (userType === "dvm" && !country && city) {
      toast({
        title: "Tip",
        description: "Please select a location from the dropdown to ensure accurate region tagging.",
        variant: "default"
      });
    }
    try {
      // Validate Step 2 inputs
      const validated = step2Schema.parse({
        clinicName,
        userType,
        agreedToTerms,
        agreedToPrivacy
      });

      // Additional validation for conditional fields
      if (userType === "student" && !schoolName) {
        throw new Error("Please select your school");
      }
      if (userType === "student" && schoolName === "Other" && !otherSchool) {
        throw new Error("Please enter your school name");
      }
      if (userType === "dvm" && !city) {
        throw new Error("Please enter your location");
      }
      if (userType === "dvm" && !dvmRole) {
        throw new Error("Please select your role");
      }
      if (userType === "dvm" && practiceTypes.length === 0) {
        throw new Error("Please select at least one practice type");
      }
      if (!userId) {
        throw new Error("User session lost. Please start over.");
      }
      const tags = generateTags();

      // Update clinic name
      const {
        data: profile
      } = await supabase.from("profiles").select("clinic_id").eq("user_id", userId).maybeSingle();
      if (profile?.clinic_id) {
        await supabase.from("clinics").update({
          name: validated.clinicName
        }).eq("id", profile.clinic_id);
      }

      // Update profile with professional data
      const profileUpdate: any = {
        user_type: userType,
        user_tags: tags
      };
      if (userType === "student") {
        profileUpdate.school_name = schoolName === "Other" ? otherSchool : schoolName;
      } else if (userType === "dvm") {
        profileUpdate.country = country;
        profileUpdate.state_province = stateProvince;
        profileUpdate.city = city;
        profileUpdate.dvm_role = dvmRole;
        profileUpdate.practice_types = practiceTypes;
      }
      const {
        error: updateError
      } = await supabase.from("profiles").update(profileUpdate).eq("user_id", userId);
      if (updateError) {
        console.error("Error updating profile:", updateError);
      }

      // Process referral if code was provided
      if (referralCode) {
        try {
          await supabase.functions.invoke("process-referral-signup", {
            body: {
              referralCode,
              newUserId: userId
            }
          });
        } catch (err) {
          console.error("Error processing referral:", err);
        }
      }

      // Redirect to Stripe checkout
      const priceId = getPriceId(selectedPlan, billingPeriod);
      console.log("Initiating checkout with plan:", selectedPlan, "billingPeriod:", billingPeriod, "priceId:", priceId);
      toast({
        title: "Redirecting to payment...",
        description: "Please wait while we redirect you to Stripe."
      });
      const {
        data: checkoutData,
        error: checkoutError
      } = await supabase.functions.invoke("create-checkout", {
        body: {
          priceId,
          email: email
        }
      });
      console.log("Checkout response:", {
        checkoutData,
        checkoutError
      });
      if (checkoutError) {
        throw new Error(checkoutError.message || "Failed to create checkout session");
      }
      if (!checkoutData?.url) {
        throw new Error("Failed to get checkout URL from Stripe");
      }

      // Direct redirect to Stripe checkout
      console.log("Redirecting to Stripe checkout:", checkoutData.url);
      window.location.href = checkoutData.url;
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          variant: "destructive",
          title: "Validation error",
          description: error.errors[0].message
        });
      } else if (error instanceof Error) {
        toast({
          variant: "destructive",
          title: "Error",
          description: error.message
        });
      }
    } finally {
      setLoading(false);
    }
  };
  return <div className="min-h-screen flex flex-col bg-[#fafbfc] light" data-theme="light">
      <div className="flex-1 flex items-center justify-center p-4 py-8">
        <Card className="w-full max-w-2xl bg-white border border-[#e2e8f0] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] relative [&_input]:bg-white [&_input]:text-[#101235] [&_input]:border-[#e2e8f0] [&_input]:placeholder:text-[#94a3b8] [&_select]:bg-white [&_select]:text-[#101235] [&_button[role=combobox]]:bg-white [&_button[role=combobox]]:text-[#101235] [&_button[role=combobox]]:border-[#e2e8f0]">
          <Link to="/" className="absolute top-4 left-4 p-2 rounded-full hover:bg-[#f1f5f9] transition-colors" aria-label="Go back">
            <ArrowLeft className="h-5 w-5 text-[#64748b]" />
          </Link>
          <CardHeader className="text-center space-y-4">
            <div className="flex justify-center">
              <Link to="/" className="hover:opacity-80 transition-opacity">
                <img src={whiskrMonogram} alt="whiskr" className="h-14 w-auto" />
              </Link>
            </div>

            {/* Progress Indicator */}
            <div className="flex items-center justify-center gap-2">
              <div className={`flex items-center gap-2 ${step >= 1 ? "text-[#1ce881]" : "text-[#64748b]"}`}>
                <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold ${step >= 1 ? "bg-gradient-to-r from-[#1ce881] to-[#24ffc9] text-[#101235]" : "bg-[#f1f5f9] text-[#64748b]"}`}>
                  {step > 1 ? <Check className="h-4 w-4" /> : "1"}
                </div>
                <span className="text-sm font-medium hidden sm:inline text-[#101235]">Account</span>
              </div>
              <div className="h-px w-8 sm:w-12 bg-[#e2e8f0]"></div>
              <div className={`flex items-center gap-2 ${step >= 2 ? "text-[#1ce881]" : "text-[#64748b]"}`}>
                <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold ${step >= 2 ? "bg-gradient-to-r from-[#1ce881] to-[#24ffc9] text-[#101235]" : "bg-[#f1f5f9] text-[#64748b]"}`}>
                  2
                </div>
                <span className="text-sm font-medium hidden sm:inline text-[#101235]">Professional Info</span>
              </div>
            </div>

            <div>
              <CardTitle className="text-2xl text-[#101235]">
                {step === 1 ? "Create Your Account" : "Professional Information"}
              </CardTitle>
              <CardDescription className="text-[#64748b]">
                {step === 1 ? "Start risk-free — 30-day money-back guarantee" : "Complete your profile to continue"}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {step === 1 ?
          // STEP 1: Basic Info + Plan Selection
          <form onSubmit={handleStep1Submit} className="space-y-6">
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg text-primary-foreground">Basic Information</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name" className="font-semibold text-lg text-foreground">
                        Full Name *
                      </Label>
                      <Input id="name" type="text" placeholder="Dr. Jane Smith" value={name} onChange={e => setName(e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone" className="text-foreground">
                        Phone Number *
                      </Label>
                      <Input id="phone" type="tel" placeholder="(555) 123-4567" value={phone} onChange={handlePhoneChange} maxLength={14} required />
                      <p className="text-xs text-muted-foreground">Format: (XXX) XXX-XXXX</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-foreground">
                      Email *
                    </Label>
                    <Input id="email" type="email" placeholder="veterinarian@clinic.com" value={email} onChange={e => setEmail(e.target.value)} required />
                    <p className="text-xs text-muted-foreground">We'll send a verification email to this address</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-foreground">
                      Password *
                    </Label>
                    <div className="relative">
                      <Input id="password" type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required className="pr-10" />
                      <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 hover:bg-transparent" onClick={() => setShowPassword(!showPassword)}>
                        {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                      </Button>
                    </div>
                    <PasswordStrengthIndicator password={password} />
                  </div>
                </div>

                {/* Plan Selection */}
                <div className="space-y-4 pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-lg text-primary-foreground">Choose Your Plan</h3>
                      <p className="text-sm text-muted-foreground">Select the plan that best fits your practice</p>
                    </div>
                    {/* Billing Toggle */}
                    <div className="inline-flex items-center gap-1 p-1 rounded-full bg-muted border border-border">
                      <button type="button" onClick={() => setBillingPeriod("monthly")} className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${billingPeriod === "monthly" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                        Monthly
                      </button>
                      <button type="button" onClick={() => setBillingPeriod("yearly")} className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${billingPeriod === "yearly" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                        Yearly
                      </button>
                      {billingPeriod === "yearly" && <span className="px-2 py-1 text-xs font-bold text-primary">Launch Pricing</span>}
                    </div>
                  </div>

                  <RadioGroup value={selectedPlan} onValueChange={value => updatePlan(value as "basic" | "professional")}>
                    <div className="grid gap-4">
                      {/* Basic Plan */}
                      <div className={`relative rounded-lg border-2 p-4 cursor-pointer transition-all ${selectedPlan === "basic" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}>
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3 flex-1">
                            <RadioGroupItem value="basic" id="plan-basic" className="mt-1" />
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Label htmlFor="plan-basic" className="text-lg font-semibold cursor-pointer text-foreground">
                                  {SUBSCRIPTION_TIERS.basic.name}
                                </Label>
                              </div>
                              <p className="text-sm mb-2 text-primary-foreground">
                                {SUBSCRIPTION_TIERS.basic.description}
                              </p>
                              <div className="flex items-baseline gap-2 mb-3">
                                <span className="text-2xl font-bold text-muted">
                                  ${getPrice("basic", billingPeriod)}
                                </span>
                                <span className="text-sm text-primary-foreground">/month</span>
                                {billingPeriod === "yearly" && getOriginalPrice("basic", billingPeriod) !== getPrice("basic", billingPeriod) && <span className="text-xs line-through text-primary-foreground">
                                      ${getOriginalPrice("basic", billingPeriod)}/mo
                                    </span>}
                              </div>
                              {billingPeriod === "yearly" && <p className="text-xs text-primary font-medium mb-2">
                                  Billed annually (${(getPrice("basic", billingPeriod) || 0) * 12}/year)
                                </p>}
                              <ul className="space-y-1.5 text-sm">
                                {SUBSCRIPTION_TIERS.basic.features.map((feature, idx) => <li key={idx} className="flex items-start gap-2">
                                    <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                                    <span className="text-primary-foreground">{feature}</span>
                                  </li>)}
                              </ul>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Pro Plan */}
                      <div className={`relative rounded-lg border-2 p-4 cursor-pointer transition-all ${selectedPlan === "professional" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}>
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3 flex-1">
                            <RadioGroupItem value="professional" id="plan-professional" className="mt-1" />
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Label htmlFor="plan-professional" className="text-lg font-semibold cursor-pointer text-foreground">
                                  {SUBSCRIPTION_TIERS.professional.name}
                                </Label>
                                <div className="bg-primary text-primary-foreground px-2 py-0.5 rounded text-xs font-semibold">
                                  Most Popular
                                </div>
                              </div>
                              <p className="text-sm mb-2 text-primary-foreground">
                                {SUBSCRIPTION_TIERS.professional.description}
                              </p>
                              <div className="flex items-baseline gap-2 mb-3">
                                <span className="text-2xl font-bold text-primary-foreground">
                                  ${getPrice("professional", billingPeriod)}
                                </span>
                                <span className="text-sm text-primary-foreground">/month</span>
                                {billingPeriod === "yearly" && getOriginalPrice("professional", billingPeriod) !== getPrice("professional", billingPeriod) && <span className="text-xs line-through text-primary-foreground">
                                      ${getOriginalPrice("professional", billingPeriod)}/mo
                                    </span>}
                              </div>
                              {billingPeriod === "yearly" && <p className="text-xs text-primary font-medium mb-2">
                                  Billed annually (${(getPrice("professional", billingPeriod) || 0) * 12}/year)
                                </p>}
                              <ul className="space-y-1.5 text-sm">
                                {SUBSCRIPTION_TIERS.professional.features.map((feature, idx) => <li key={idx} className="flex items-start gap-2">
                                    <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                                    <span className="text-primary-foreground">{feature}</span>
                                  </li>)}
                              </ul>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </RadioGroup>
                </div>

                <Button type="submit" className="w-full" size="lg" disabled={loading}>
                  {loading ? <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating account...
                    </> : "Create Account"}
                </Button>

                <div className="text-center text-sm text-muted-foreground">
                  Already have an account?{" "}
                  <Link to="/login" className="text-primary hover:underline">
                    Sign in
                  </Link>
                </div>
              </form> :
          // STEP 2: Professional Information
          <form onSubmit={handleStep2Submit} className="space-y-5">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="clinicName" className="text-foreground">
                      Clinic/Practice Name *
                    </Label>
                    <Input id="clinicName" type="text" placeholder="Happy Paws Veterinary Clinic" value={clinicName} onChange={e => setClinicName(e.target.value)} required />
                  </div>

                  <div className="space-y-3">
                    <Label className="text-foreground">I am a *</Label>
                    <RadioGroup value={userType} onValueChange={value => setUserType(value as "dvm" | "student")}>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="dvm" id="dvm" />
                        <Label htmlFor="dvm" className="cursor-pointer font-normal">
                          Doctor of Veterinary Medicine (DVM)
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="student" id="student" />
                        <Label htmlFor="student" className="cursor-pointer font-normal">
                          Veterinary Student
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                </div>

                {/* Student-specific fields */}
                {userType === "student" && <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                    <div className="space-y-2">
                      <Label htmlFor="school" className="text-foreground">
                        School Name *
                      </Label>
                      <Select value={schoolName} onValueChange={setSchoolName}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select your veterinary school" />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          {VET_SCHOOLS.map(school => <SelectItem key={school} value={school}>
                              {school}
                            </SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    {schoolName === "Other" && <div className="space-y-2">
                        <Label htmlFor="otherSchool" className="text-foreground">
                          Enter School Name *
                        </Label>
                        <Input id="otherSchool" type="text" placeholder="Your veterinary school" value={otherSchool} onChange={e => setOtherSchool(e.target.value)} required />
                      </div>}
                  </div>}

                {/* DVM-specific fields */}
                {userType === "dvm" && <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                    <div className="space-y-2">
                      <Label htmlFor="city" className="text-foreground">
                        Location (City) *
                      </Label>
                      <div className="relative" ref={dropdownRef}>
                        <Input id="city" type="text" placeholder="Start typing your city..." value={city} onChange={e => handleCityInputChange(e.target.value)} required />
                        {showSuggestions && citySuggestions.length > 0 && <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-y-auto">
                            {citySuggestions.map((suggestion, index) => <div key={index} className="px-4 py-2 hover:bg-muted cursor-pointer" onClick={() => handleCitySuggestionSelect(suggestion)}>
                                <div className="font-medium">{suggestion.city}</div>
                                <div className="text-sm text-muted-foreground">
                                  {suggestion.state}, {suggestion.country}
                                </div>
                              </div>)}
                          </div>}
                        {loadingSuggestions && <div className="absolute right-3 top-3">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="dvmRole" className="text-foreground">
                        Your Role *
                      </Label>
                      <Select value={dvmRole} onValueChange={setDvmRole}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select your role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="owner">Practice Owner</SelectItem>
                          <SelectItem value="associate">Associate Veterinarian</SelectItem>
                          <SelectItem value="locum">Locum/Relief Veterinarian</SelectItem>
                          <SelectItem value="specialist">Specialist</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-foreground">Practice Type(s) * (Select all that apply)</Label>
                      <div className="grid grid-cols-2 gap-3">
                        {PRACTICE_TYPES.map(type => <div key={type.id} className="flex items-center space-x-2">
                            <Checkbox id={type.id} checked={practiceTypes.includes(type.id)} onCheckedChange={() => togglePracticeType(type.id)} />
                            <label htmlFor={type.id} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer text-foreground">
                              {type.label}
                            </label>
                          </div>)}
                      </div>
                    </div>
                  </div>}

                {/* Referral Code */}
                <div className="space-y-2">
                  <Label htmlFor="referralCode" className="text-foreground">
                    Referral Code (Optional)
                  </Label>
                  <Input id="referralCode" type="text" placeholder="Enter a referral code" value={referralCode} onChange={e => setReferralCode(e.target.value)} />
                </div>

                {/* Terms and Privacy */}
                <div className="space-y-3 pt-4 border-t">
                  <div className="flex items-start space-x-3">
                    <Checkbox id="terms" checked={agreedToTerms} onCheckedChange={checked => setAgreedToTerms(checked as boolean)} />
                    <label htmlFor="terms" className="text-sm leading-tight cursor-pointer text-foreground">
                      I agree to the{" "}
                      <Link to="/terms" target="_blank" className="text-primary hover:underline font-medium">
                        Terms and Conditions
                      </Link>
                      , including the acknowledgment that this platform is for educational purposes only and does not
                      provide medical advice.
                    </label>
                  </div>

                  <div className="flex items-start space-x-3">
                    <Checkbox id="privacy" checked={agreedToPrivacy} onCheckedChange={checked => setAgreedToPrivacy(checked as boolean)} />
                    <label htmlFor="privacy" className="text-sm leading-tight cursor-pointer text-foreground">
                      I agree to the{" "}
                      <Link to="/privacy" target="_blank" className="text-primary hover:underline font-medium">
                        Privacy Policy
                      </Link>
                    </label>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button type="button" variant="outline" onClick={() => setStep(1)} disabled={loading} className="flex-1">
                    Back
                  </Button>
                  <Button type="submit" className="flex-1" size="lg" disabled={loading || !agreedToTerms || !agreedToPrivacy || !userType}>
                    {loading ? <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </> : "Next Step — Payment"}
                  </Button>
                </div>

                <div className="text-center space-y-1">
                  <p className="text-xs text-muted-foreground">You'll be redirected to Stripe to complete payment</p>
                  <p className="text-xs text-muted-foreground">30-Day Money-Back Guarantee • Cancel Anytime</p>
                </div>
              </form>}
          </CardContent>
        </Card>
      </div>
      <Footer />
    </div>;
}