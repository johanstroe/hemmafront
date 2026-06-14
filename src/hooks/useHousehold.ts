import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type Household = {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
};

export type Member = {
  id: string;
  household_id: string;
  user_id: string;
  display_name: string;
  avatar_color: string;
  role: "admin" | "member";
};

export function useHousehold() {
  const { user, loading: authLoading } = useAuth();
  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHousehold = async () => {
    if (!user) {
      setHousehold(null);
      setMembers([]);
      setLoading(false);
      return;
    }

    const { data: myMembership } = await supabase
      .from("household_members")
      .select("household_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!myMembership) {
      setHousehold(null);
      setMembers([]);
      setLoading(false);
      return;
    }

    const [householdRes, membersRes] = await Promise.all([
      supabase.from("households").select("*").eq("id", myMembership.household_id).single(),
      supabase.from("household_members").select("*").eq("household_id", myMembership.household_id),
    ]);

    setHousehold(householdRes.data as Household | null);
    setMembers((membersRes.data as Member[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (authLoading) return;
    fetchHousehold();
  }, [user?.id, authLoading]);

  useEffect(() => {
    if (!household) return;
    const channel = supabase
      .channel(`household-${household.id}-members`)
      .on("postgres_changes", { event: "*", schema: "public", table: "household_members", filter: `household_id=eq.${household.id}` }, () => {
        fetchHousehold();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [household?.id]);

  return { household, members, loading: authLoading || loading, refresh: fetchHousehold };
}