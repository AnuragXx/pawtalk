import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { userService, petService } from '../services/firestore';

const UserContext = createContext();

export function UserProvider({ children }) {
  const [ownerName, setOwnerName] = useState('');
  const [petName, setPetName]     = useState('');
  const [petType, setPetType]     = useState('');
  const [petBreed, setPetBreed]   = useState('');
  const [petPhotoUri, setPetPhotoUri] = useState(null);

  const refreshPet = async (uid) => {
    if (!uid) return;
    try {
      const pets = await petService.getAll(uid);
      if (pets.length > 0) {
        const p = pets[0];
        setPetName(p.petName || '');
        setPetType(p.petType || p.species || '');
        setPetBreed(p.breed   || '');
        setPetPhotoUri(p.photoUri || null);
      }
    } catch (_) {}
  };

  return (
    <UserContext.Provider value={{
      ownerName, setOwnerName,
      petName,   setPetName,
      petType,   setPetType,
      petBreed,  setPetBreed,
      petPhotoUri, setPetPhotoUri,
      refreshPet,
    }}>
      <UserContextLoader
        setOwnerName={setOwnerName}
        setPetName={setPetName}
        setPetType={setPetType}
        setPetBreed={setPetBreed}
        setPetPhotoUri={setPetPhotoUri}
      />
      {children}
    </UserContext.Provider>
  );
}

function UserContextLoader({ setOwnerName, setPetName, setPetType, setPetBreed, setPetPhotoUri }) {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setOwnerName('');
      setPetName('');
      setPetType('');
      setPetBreed('');
      setPetPhotoUri(null);
      return;
    }
    // Load owner name
    userService.get(user.uid).then(data => {
      if (data?.displayName) setOwnerName(data.displayName);
    }).catch(() => {});
    // Load pet data
    petService.getAll(user.uid).then(pets => {
      if (pets.length > 0) {
        const p = pets[0];
        setPetName(p.petName   || '');
        // Handle both field names
        setPetType(p.petType || p.species || '');
        setPetBreed(p.breed    || '');
        setPetPhotoUri(p.photoUri || null);
      }
    }).catch(() => {});
  }, [user]);

  return null;
}

export function useUser() {
  return useContext(UserContext);
}
