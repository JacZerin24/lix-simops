RADAR_PRODUCTS = {
    "REF": "Base Reflectivity",
    "VEL": "Base Velocity",
    "SRM": "Storm Relative Motion",
    "CC": "Correlation Coefficient",
    "ZDR": "Differential Reflectivity",
}

RADAR_RENDER_CONFIG = {
    "REF": {
        "field_candidates": ["reflectivity"],
        "units": "dBZ",
        "vmin": -10.0,
        "vmax": 80.0,
        "cmap": "pyart_NWSRef",
    },
    "VEL": {
        "field_candidates": ["velocity"],
        "units": "kt",
        "vmin": -80.0,
        "vmax": 80.0,
        "cmap": "pyart_NWSVel",
    },
    "CC": {
        "field_candidates": ["cross_correlation_ratio"],
        "units": "",
        "vmin": 0.70,
        "vmax": 1.05,
        "cmap": "viridis",
    },
    "ZDR": {
        "field_candidates": ["differential_reflectivity"],
        "units": "dB",
        "vmin": -2.0,
        "vmax": 8.0,
        "cmap": "coolwarm",
    },
}
