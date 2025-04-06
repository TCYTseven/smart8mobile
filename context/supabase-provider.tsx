import { Session, User } from "@supabase/supabase-js";
import { useRouter, useSegments, SplashScreen } from "expo-router";
import { createContext, useContext, useEffect, useState, useCallback } from "react";

import { supabase } from "@/config/supabase";

SplashScreen.preventAutoHideAsync();

type SupabaseContextProps = {
	user: User | null;
	session: Session | null;
	initialized?: boolean;
	signUp: (email: string, password: string, metadata?: { username?: string; full_name?: string }) => Promise<{ data: any; error: any }>;
	signInWithPassword: (email: string, password: string) => Promise<{ data: any; error: any }>;
	signOut: () => Promise<void>;
	onLayoutRootView: () => Promise<void>;
};

type SupabaseProviderProps = {
	children: React.ReactNode;
};

export const SupabaseContext = createContext<SupabaseContextProps>({
	user: null,
	session: null,
	initialized: false,
	signUp: async () => ({ data: null, error: null }),
	signInWithPassword: async () => ({ data: null, error: null }),
	signOut: async () => { },
	onLayoutRootView: async () => { },
});

export const useSupabase = () => useContext(SupabaseContext);

export const SupabaseProvider = ({ children }: SupabaseProviderProps) => {
	const router = useRouter();
	const segments = useSegments();
	const [user, setUser] = useState<User | null>(null);
	const [session, setSession] = useState<Session | null>(null);
	const [initialized, setInitialized] = useState<boolean>(false);
	const [appIsReady, setAppIsReady] = useState<boolean>(false);

	const signUp = async (email: string, password: string, metadata?: { username?: string; full_name?: string }) => {
		const { data, error } = await supabase.auth.signUp({
			email,
			password,
			options: {
				data: metadata,
			},
		});
		console.log("Supabase sign up response:", { data, error });
		if (error) {
			throw error;
		}

		// Create user profile manually after signup
		if (data.user) {
			try {
				const { error: profileError } = await supabase
					.from('user_profiles')
					.insert([
						{ 
							id: data.user.id,
							personality_type: "NONE",
							advisor: "Assistant",
							custom_advisors: "Not Set"
						}
					]);
				
				if (profileError) {
					console.error("Error creating user profile:", profileError);
				}
			} catch (profileErr) {
				console.error("Exception creating user profile:", profileErr);
			}
		}

		return { data, error };
	};

	// Ensure user profile exists
	const ensureUserProfile = async (userId: string) => {
		try {
			// Check if profile exists
			const { data: existingProfile } = await supabase
				.from('user_profiles')
				.select('id')
				.eq('id', userId)
				.single();
			
			// If profile doesn't exist, create it
			if (!existingProfile) {
				const { error: profileError } = await supabase
					.from('user_profiles')
					.insert([
						{ 
							id: userId,
							personality_type: "NONE",
							advisor: "Assistant",
							custom_advisors: "Not Set"
						}
					]);
				
				if (profileError) {
					console.error("Error creating user profile:", profileError);
				}
			}
		} catch (err) {
			console.error("Error ensuring user profile:", err);
		}
	};

	const signInWithPassword = async (email: string, password: string) => {
		const { data, error } = await supabase.auth.signInWithPassword({
			email,
			password,
		});
		console.log("Supabase sign in response:", { data, error });
		if (error) {
			throw error;
		}

		// Ensure user profile exists
		if (data.user) {
			await ensureUserProfile(data.user.id);
		}
		
		return { data, error };
	};

	const signOut = async () => {
		const { error } = await supabase.auth.signOut();
		if (error) {
			throw error;
		}
	};

	useEffect(() => {
		async function prepare() {
			try {
				const { data: { session } } = await supabase.auth.getSession();
				setSession(session);
				setUser(session ? session.user : null);
				
				// Ensure user profile exists if user is logged in
				if (session?.user) {
					await ensureUserProfile(session.user.id);
				}
				
				setInitialized(true);

				const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
					setSession(session);
					setUser(session ? session.user : null);
				});

				await new Promise(resolve => setTimeout(resolve, 100));
			} catch (e) {
				console.warn(e);
			} finally {
				setAppIsReady(true);
			}
		}

		prepare();
	}, []);

	useEffect(() => {
		if (!initialized || !appIsReady) return;

		const inProtectedGroup = segments[1] === "(protected)";

		if (session && !inProtectedGroup) {
			router.replace("/(app)/(protected)");
		} else if (!session) {
			router.replace("/(app)/welcome");
		}
	}, [initialized, appIsReady, session]);

	const onLayoutRootView = useCallback(async () => {
		if (appIsReady) {
			await SplashScreen.hideAsync();
		}
	}, [appIsReady]);

	if (!initialized || !appIsReady) {
		return null;
	}

	return (
		<SupabaseContext.Provider
			value={{
				user,
				session,
				initialized,
				signUp,
				signInWithPassword,
				signOut,
				onLayoutRootView,
			}}
		>
			{children}
		</SupabaseContext.Provider>
	);
};
