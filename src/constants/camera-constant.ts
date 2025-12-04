export const INITIAL_CAMERA = {
  physicalId: "",
  url: "",
  typeId: "",
  name: "",
  mac: "",
  serverId: "",
  vendor: "",
  model: "",
  group: {
    id: "",
    name: "",
  },
  credentials: {
    user: "",
    password: "",
  },
  logicalId: "",
};

export const INITIAL_STATE_CAMERA = {
  status: "idle",
  errors: {
    id: [],
    physicalId: [],
    url: [],
    typeId: [],
    name: [],
    mac: [],
    serverId: [],
    vendor: [],
    model: [],
    group: {
      id: [],
      name: [],
    },
    credentials: {
      user: [],
      password: [],
    },
    logicalId: [],
    _form: [],
  },
};
