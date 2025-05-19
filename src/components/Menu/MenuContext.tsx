import React from 'react';

export const MenuContext = React.createContext<{selectable: boolean}>({
  selectable: false,
});
