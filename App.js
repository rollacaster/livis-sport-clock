import React, { useState, useEffect } from 'react'
import { activateKeepAwake, deactivateKeepAwake } from 'expo-keep-awake'
import { SafeAreaView, Text, View, TouchableHighlight } from 'react-native'
import tailwind from 'tailwind-rn'
import { Audio } from 'expo-av'
import { FontAwesome } from '@expo/vector-icons'

const Button = ({ children, onClick }) => (
  <TouchableHighlight
    style={tailwind(
      'bg-orange-400 w-16 h-16 rounded-full items-center justify-center'
    )}
    onPress={onClick}
  >
    {children}
  </TouchableHighlight>
)

const Button2 = ({ children, onClick }) => (
  <TouchableHighlight
    style={tailwind('bg-orange-400 p-2 rounded-lg')}
    onPress={onClick}
  >
    {children}
  </TouchableHighlight>
)

function Counter() {
  const [clock, setClock] = useState(10)
  const [pauseClock, setPauseClock] = useState(10)
  const [running, setRunning] = useState(false)
  const [pause, setPause] = useState(false)
  const [manuelPause, setManuelPause] = useState(false)

  useEffect(() => {
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true })
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      if (clock === 0) {
        deactivateKeepAwake()

        Audio.Sound.createAsync(require('./assets/wistle.wav'), {
          shouldPlay: true,
        })
          .then(() =>
            Audio.Sound.createAsync(require('./assets/wistle.wav'), {
              shouldPlay: true,
            })
          )
          .then(() =>
            Audio.Sound.createAsync(require('./assets/wistle.wav'), {
              shouldPlay: true,
            })
          )
        setRunning(false)
        setClock(10)
      } else if (manuelPause) {
        console.log('do manuel Pause')
      } else if (pauseClock === 0) {
        setPause(false)
        setPauseClock(10)
        setClock(clock - 1)
        Audio.Sound.createAsync(require('./assets/wistle.wav'), {
          shouldPlay: true,
        })
      } else if (pause) {
        setPauseClock(pauseClock - 1)
      } else if (running && clock % 60 === 0) {
        Audio.Sound.createAsync(require('./assets/wistle.wav'), {
          shouldPlay: true,
        })
        setPause(true)
      } else if (running) {
        setClock(clock - 1)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [pause, pauseClock, clock, running, manuelPause])

  return (
    <View style={tailwind('flex-1 items-center justify-center')}>
      {!running ? (
        <>
          <View style={tailwind('flex-row items-center mb-5')}>
            <Button onClick={() => setClock(clock - 1)}>
              <Text style={tailwind('text-white text-4xl')}>-</Text>
            </Button>
            <Text style={tailwind('text-6xl mx-6 w-20 text-center')}>
              {clock}
            </Text>
            <Button onClick={() => setClock(clock + 1)}>
              <Text style={tailwind('text-white text-4xl')}>+</Text>
            </Button>
          </View>
          <Button2
            onClick={() => {
              activateKeepAwake()
              setRunning(true)
              setClock(clock * 60 - 1)
            }}
          >
            <Text style={tailwind('text-white p-2')}>
              <FontAwesome name="play" size={32} />
            </Text>
          </Button2>
        </>
      ) : (
        <>
          {pause ? (
            <Text style={tailwind('text-6xl text-center text-green-400 mb-5')}>
              {pauseClock}
            </Text>
          ) : (
            <Text style={tailwind('text-6xl text-center mb-5')}>
              {Math.floor(clock / 60) +
                ':' +
                (clock % 60).toString().padStart(2, '0')}
            </Text>
          )}
          <View style={tailwind('flex flex-row')}>
            {!manuelPause ? (
              <View style={tailwind('mr-12')}>
                <Button2
                  onClick={() => {
                    setManuelPause(true)
                  }}
                >
                  <Text style={tailwind('text-white p-2')}>
                    <FontAwesome name="pause" size={32} />
                  </Text>
                </Button2>
              </View>
            ) : (
              <View style={tailwind('mr-12')}>
                <Button2
                  onClick={() => {
                    setManuelPause(false)
                  }}
                >
                  <Text style={tailwind('text-white p-2')}>
                    <FontAwesome name="play" size={32} />
                  </Text>
                </Button2>
              </View>
            )}
            <Button2
              onClick={() => {
                setRunning(false)
                setClock(10)
                setPause(false)
                setManuelPause(false)
                setPauseClock(10)
              }}
            >
              <Text style={tailwind('text-white p-2')}>
                <FontAwesome name="stop" size={32} />
              </Text>
            </Button2>
          </View>
        </>
      )}
    </View>
  )
}

export default function App() {
  return (
    <SafeAreaView style={tailwind('flex-1 bg-orange-400')}>
      <View
        style={tailwind('p-3 flex-row justify-center bg-orange-400 w-full')}
      >
        <Text style={tailwind('text-3xl text-white')}>Livi's Sport Clock</Text>
      </View>
      <View style={tailwind('flex-1 bg-white')}>
        <Counter />
      </View>
    </SafeAreaView>
  )
}
