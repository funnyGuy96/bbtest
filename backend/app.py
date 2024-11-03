from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime, timedelta
import threading
import time
import atexit

app = Flask(__name__)
CORS(app)

# Enhanced game state
game_state = {
    'home_team': {
        'name': 'Home Team',
        'score': 0,
        'fouls': 0,
        'technical_fouls': 0,
        'timeouts_left': 4,
        'in_bonus': False,
        'players': {
            # Example player structure
            '11': {
                'name': 'John Doe',
                'number': '11',
                'points': 0,
                'fouls': 0,
                'assists': 0,
                'rebounds': 0,
                'steals': 0,
                'blocks': 0,
                'in_game': True
            }
        }
    },
    'away_team': {
        'name': 'Away Team',
        'score': 0,
        'fouls': 0,
        'technical_fouls': 0,
        'timeouts_left': 4,
        'in_bonus': False,
        'players': {}
    },
    'game_clock': {
        'time': '12:00',
        'running': False,
        'quarter': 1
    },
    'possession': 'home_team',
    'last_updated': datetime.now().isoformat(),
    'shot_clock': {
        'time': 24,  # NBA shot clock is 24 seconds
        'running': False,
        'violation': False
    }
}

clock_thread = None
shot_clock_thread = None
clock_lock = threading.Lock()
shot_clock_lock = threading.Lock()

def update_game_clock():
    global game_state
    while game_state['game_clock']['running']:
        with clock_lock:
            current_time = datetime.strptime(game_state['game_clock']['time'], '%M:%S')
            if current_time > datetime.strptime('00:00', '%M:%S'):
                new_time = current_time - timedelta(seconds=1)
                game_state['game_clock']['time'] = new_time.strftime('%M:%S')
            else:
                game_state['game_clock']['running'] = False
        time.sleep(1)

def update_shot_clock():
    global game_state
    while game_state['shot_clock']['running']:
        with shot_clock_lock:
            if game_state['shot_clock']['time'] > 0:
                game_state['shot_clock']['time'] -= 1
                if game_state['shot_clock']['time'] == 0:
                    game_state['shot_clock']['violation'] = True
                    game_state['shot_clock']['running'] = False
                    game_state['game_clock']['running'] = False  # Stop game clock on violation
            else:
                game_state['shot_clock']['running'] = False
        time.sleep(1)

# Existing endpoints
@app.route('/api/game', methods=['GET'])
def get_game_state():
    return jsonify(game_state)

@app.route('/api/score', methods=['POST'])
def update_score():
    data = request.json
    team = data.get('team')
    points = data.get('points')
    
    if team in ['home_team', 'away_team']:
        game_state[team]['score'] += points
        if points > 0:
            # Reset shot clock and switch possession on successful score
            game_state['shot_clock']['time'] = 24
            game_state['shot_clock']['running'] = False
            game_state['shot_clock']['violation'] = False
            game_state['possession'] = 'away_team' if team == 'home_team' else 'home_team'
        game_state['last_updated'] = datetime.now().isoformat()
        return jsonify(game_state)
    return jsonify({'error': 'Invalid team'}), 400

# New endpoints
@app.route('/api/clock', methods=['POST'])
def manage_clock():
    global clock_thread
    data = request.json
    action = data.get('action')
    
    if action == 'start':
        game_state['game_clock']['running'] = True
        if not clock_thread or not clock_thread.is_alive():
            clock_thread = threading.Thread(target=update_game_clock)
            clock_thread.daemon = True
            clock_thread.start()
    elif action == 'stop':
        game_state['game_clock']['running'] = False
    elif action == 'reset':
        game_state['game_clock']['running'] = False
        game_state['game_clock']['time'] = '12:00'
    
    game_state['last_updated'] = datetime.now().isoformat()
    return jsonify(game_state)

@app.route('/api/quarter', methods=['POST'])
def change_quarter():
    data = request.json
    action = data.get('action')
    
    if action == 'next' and game_state['game_clock']['quarter'] < 4:
        game_state['game_clock']['quarter'] += 1
        game_state['game_clock']['time'] = '12:00'
    elif action == 'previous' and game_state['game_clock']['quarter'] > 1:
        game_state['game_clock']['quarter'] -= 1
    
    game_state['last_updated'] = datetime.now().isoformat()
    return jsonify(game_state)

@app.route('/api/player/stats', methods=['POST'])
def update_player_stats():
    data = request.json
    team = data.get('team')
    player_number = data.get('player_number')
    stat_type = data.get('stat_type')  # 'assists', 'rebounds', 'steals', 'blocks'
    
    if team in ['home_team', 'away_team'] and player_number in game_state[team]['players']:
        if stat_type in ['assists', 'rebounds', 'steals', 'blocks']:
            game_state[team]['players'][player_number][stat_type] += 1
            game_state['last_updated'] = datetime.now().isoformat()
            return jsonify(game_state)
    return jsonify({'error': 'Invalid request'}), 400

@app.route('/api/substitution', methods=['POST'])
def make_substitution():
    data = request.json
    team = data.get('team')
    player_in = data.get('player_in')
    player_out = data.get('player_out')
    
    if team in ['home_team', 'away_team']:
        if player_out in game_state[team]['players']:
            game_state[team]['players'][player_out]['in_game'] = False
        if player_in in game_state[team]['players']:
            game_state[team]['players'][player_in]['in_game'] = True
        game_state['last_updated'] = datetime.now().isoformat()
        return jsonify(game_state)
    return jsonify({'error': 'Invalid team'}), 400

@app.route('/api/player', methods=['POST'])
def manage_player():
    data = request.json
    action = data.get('action')  # 'add' or 'remove'
    team = data.get('team')
    player_data = data.get('player_data')
    
    if team in ['home_team', 'away_team']:
        if action == 'add' and player_data:
            number = str(player_data.get('number'))
            game_state[team]['players'][number] = {
                'name': player_data.get('name'),
                'number': number,
                'points': 0,
                'fouls': 0,
                'assists': 0,
                'rebounds': 0,
                'steals': 0,
                'blocks': 0,
                'in_game': True
            }
        elif action == 'remove':
            number = str(player_data.get('number'))
            if number in game_state[team]['players']:
                del game_state[team]['players'][number]
        
        game_state['last_updated'] = datetime.now().isoformat()
        return jsonify(game_state)
    return jsonify({'error': 'Invalid team'}), 400

@app.route('/api/shot-clock', methods=['POST'])
def manage_shot_clock():
    global shot_clock_thread
    data = request.json
    action = data.get('action')
    
    if action == 'start':
        game_state['shot_clock']['running'] = True
        game_state['shot_clock']['violation'] = False
        if not shot_clock_thread or not shot_clock_thread.is_alive():
            shot_clock_thread = threading.Thread(target=update_shot_clock)
            shot_clock_thread.daemon = True
            shot_clock_thread.start()
    elif action == 'stop':
        game_state['shot_clock']['running'] = False
    elif action == 'reset':
        reset_type = data.get('type', 'full')
        game_state['shot_clock']['time'] = 24 if reset_type == 'full' else 14
        game_state['shot_clock']['violation'] = False
    elif action == 'violation':
        game_state['shot_clock']['violation'] = True
        game_state['shot_clock']['running'] = False
    
    game_state['last_updated'] = datetime.now().isoformat()
    return jsonify(game_state)

@app.route('/api/possession', methods=['POST'])
def update_possession():
    data = request.json
    team = data.get('team')
    
    if team in ['home_team', 'away_team']:
        game_state['possession'] = team
        game_state['last_updated'] = datetime.now().isoformat()
        return jsonify(game_state)
    return jsonify({'error': 'Invalid team'}), 400

@app.route('/api/foul', methods=['POST'])
def add_foul():
    data = request.json
    team = data.get('team')
    
    if team in ['home_team', 'away_team']:
        game_state[team]['fouls'] += 1
        # Check for bonus situation
        if game_state[team]['fouls'] >= 5:
            game_state[team]['in_bonus'] = True
        game_state['last_updated'] = datetime.now().isoformat()
        return jsonify(game_state)
    return jsonify({'error': 'Invalid team'}), 400

@app.route('/api/technical-foul', methods=['POST'])
def add_technical_foul():
    data = request.json
    team = data.get('team')
    
    if team in ['home_team', 'away_team']:
        game_state[team]['technical_fouls'] += 1
        game_state['last_updated'] = datetime.now().isoformat()
        return jsonify(game_state)
    return jsonify({'error': 'Invalid team'}), 400

@app.route('/api/timeout', methods=['POST'])
def call_timeout():
    data = request.json
    team = data.get('team')
    
    if team in ['home_team', 'away_team']:
        if game_state[team]['timeouts_left'] > 0:
            game_state[team]['timeouts_left'] -= 1
            game_state['last_updated'] = datetime.now().isoformat()
            return jsonify(game_state)
        return jsonify({'error': 'No timeouts left'}), 400
    return jsonify({'error': 'Invalid team'}), 400

@atexit.register
def cleanup():
    game_state['game_clock']['running'] = False
    game_state['shot_clock']['running'] = False

if __name__ == '__main__':
    print("Starting server...")
    app.run(debug=True, port=8000)