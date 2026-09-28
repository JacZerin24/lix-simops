ROLE_CAPABILITIES = {
    "radar": {"view_radar", "view_team_feed"},
    "mesoanalyst": {"view_environment", "view_team_feed"},
    "dss": {"view_event", "send_partner_message", "view_team_feed"},
    "facilitator": {
        "control_clock",
        "release_injects",
        "view_all_teams",
        "view_event_log",
    },
}


def can(role: str, capability: str) -> bool:
    return capability in ROLE_CAPABILITIES.get(role, set())
