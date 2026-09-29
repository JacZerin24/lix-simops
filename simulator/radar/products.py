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
        "units": "m/s",
        "vmin": -40.0,
        "vmax": 40.0,
        "cmap": "pyart_NWSVel",
    },
    "CC": {
        "field_candidates": ["cross_correlation_ratio"],
        "units": "",
        "vmin": 0.20,
        "vmax": 1.04,
        "cmap": "twip_cc",
        "palette_file": "cc_twip.pal",
    },
    "ZDR": {
        "field_candidates": ["differential_reflectivity"],
        "units": "dB",
        "vmin": -4.0,
        "vmax": 8.0,
        "cmap": "schlatter_dp_zdr_gra2",
        "palette_file": "zdr_schlatter_dp_gra2.pal",
    },
}
