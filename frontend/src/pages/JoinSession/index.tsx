import type { Role } from "../../types/simulation";

type Props = {
  role: Role;
  teamId: string;
  onRoleChange: (role: Role) => void;
  onTeamChange: (teamId: string) => void;
};

export function JoinSession({ role, teamId, onRoleChange, onTeamChange }: Props) {
  return (
    <section className="joinrow">
      <label>
        Team
        <select value={teamId} onChange={(e) => onTeamChange(e.target.value)}>
          <option>Team 1</option>
          <option>Team 2</option>
          <option>Team 3</option>
          <option>Team 4</option>
        </select>
      </label>
      <label>
        Role
        <select value={role} onChange={(e) => onRoleChange(e.target.value as Role)}>
          <option value="radar">Radar Operator</option>
          <option value="mesoanalyst">Mesoanalyst</option>
          <option value="dss">DSS Meteorologist</option>
          <option value="facilitator">Facilitator</option>
        </select>
      </label>
    </section>
  );
}
